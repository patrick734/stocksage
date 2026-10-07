import "server-only";
import { createPublicClient, http, parseEther, zeroAddress, type Address } from "viem";
import { deployments, type Deployment } from "@/generated/deployments";
import { marketAbi, oracleAbi, registryAbi } from "@/generated/abis";
import { seeds } from "@/generated/seeds";
import { localChain, robinhoodChain } from "../chains";
import { hashBytes } from "../agentConfig";
import { settings } from "./env";

const local = process.env.NEXT_PUBLIC_ENABLE_LOCAL === "1";

export function deployment(): Deployment | null {
  return (local ? deployments[localChain.id] : deployments[robinhoodChain.id]) ?? null;
}

let client: ReturnType<typeof makeClient> | null = null;
function makeClient() {
  return createPublicClient({
    chain: local ? localChain : robinhoodChain,
    transport: http(local ? undefined : settings.rpcUrl(), { batch: true }),
  });
}
export function publicClient() {
  return (client ??= makeClient());
}

type Calls = Parameters<ReturnType<typeof makeClient>["multicall"]>[0]["contracts"];

/** Multicall3 on Robinhood Chain; plain parallel reads on a local chain, which has no Multicall3. */
export async function readAll(contracts: Calls): Promise<unknown[]> {
  const c = publicClient();
  if (!local) return c.multicall({ allowFailure: false, contracts });
  return Promise.all((contracts as readonly Parameters<typeof c.readContract>[0][]).map((x) => c.readContract(x)));
}

export type AgentView = {
  id: number;
  name: string;
  creator: Address | null;
  createdAt: number;
  version: number;
  active: boolean;
  blocked: boolean;
  pricePerUseWei: string;
  configHash: `0x${string}`;
  metadataURI: string;
  usesSold: number;
  creatorEarned: string;
  burned: string;
  seed: boolean;
};

export type Snapshot = {
  live: boolean;
  agents: AgentView[];
  token: Address | null;
  tokenPerEth: string | null;
  priceFresh: boolean;
  deploymentFeeWei: string;
  totals: { burned: string; toTreasury: string; uses: number };
};

let cache: { at: number; snap: Snapshot } | null = null;

/** Every agent with its sales, read from the chain (cached for 5 seconds). Before deployment: the seed agents. */
export async function snapshot(): Promise<Snapshot> {
  if (cache && Date.now() - cache.at < 5_000) return cache.snap;
  const d = deployment();
  const snap = d ? await readChain(d) : preview();
  cache = { at: Date.now(), snap };
  return snap;
}

export async function agentById(id: number): Promise<AgentView | null> {
  return (await snapshot()).agents.find((a) => a.id === id) ?? null;
}

function preview(): Snapshot {
  return {
    live: false,
    agents: seeds.map((s, i) => {
      const cfg = JSON.parse(s.bytes) as { name: string };
      return {
        id: i + 1,
        name: cfg.name,
        creator: null,
        createdAt: 0,
        version: 1,
        active: true,
        blocked: false,
        pricePerUseWei: parseEther(s.pricePerUseEth).toString(),
        configHash: hashBytes(s.bytes),
        metadataURI: "",
        usesSold: 0,
        creatorEarned: "0",
        burned: "0",
        seed: true,
      };
    }),
    token: null,
    tokenPerEth: null,
    priceFresh: false,
    deploymentFeeWei: "0",
    totals: { burned: "0", toTreasury: "0", uses: 0 },
  };
}

async function readChain(d: Deployment): Promise<Snapshot> {
  const reg = { address: d.registry, abi: registryAbi } as const;
  const mkt = { address: d.market, abi: marketAbi } as const;
  const [count, token, fee, fresh, price, burnedM, burnedR, toTreasury] = (await readAll([
      { ...reg, functionName: "agentCount" },
      { ...reg, functionName: "token" },
      { ...reg, functionName: "deploymentFeeWei" },
      { address: d.oracle, abi: oracleAbi, functionName: "isFresh" },
      { address: d.oracle, abi: oracleAbi, functionName: "price" },
      { ...mkt, functionName: "totalBurned" },
      { ...reg, functionName: "totalBurned" },
      { ...mkt, functionName: "totalToTreasury" },
  ])) as [bigint, Address, bigint, boolean, bigint, bigint, bigint, bigint];
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
  const rows = ids.length
    ? await readAll(
        ids.flatMap((id) => [
          { ...reg, functionName: "getAgent", args: [id] } as const,
          { ...reg, functionName: "blocked", args: [id] } as const,
          { ...mkt, functionName: "agentUsesSold", args: [id] } as const,
          { ...mkt, functionName: "agentCreatorEarned", args: [id] } as const,
          { ...mkt, functionName: "agentBurned", args: [id] } as const,
        ])
      )
    : [];
  const agents: AgentView[] = ids.map((id, i) => {
    const [a, blocked, sold, earned, burned] = rows.slice(i * 5, i * 5 + 5) as [
      { creator: Address; createdAt: bigint; version: number; active: boolean; pricePerUseWei: bigint; configHash: `0x${string}`; name: string; metadataURI: string },
      boolean,
      bigint,
      bigint,
      bigint,
    ];
    return {
      id: Number(id),
      name: a.name,
      creator: a.creator,
      createdAt: Number(a.createdAt),
      version: Number(a.version),
      active: a.active,
      blocked,
      pricePerUseWei: a.pricePerUseWei.toString(),
      configHash: a.configHash,
      metadataURI: a.metadataURI,
      usesSold: Number(sold),
      creatorEarned: earned.toString(),
      burned: burned.toString(),
      seed: a.creator.toLowerCase() === d.treasury.toLowerCase(),
    };
  });
  return {
    live: true,
    agents,
    token: token === zeroAddress ? null : token,
    tokenPerEth: price === 0n ? null : price.toString(),
    priceFresh: fresh,
    deploymentFeeWei: fee.toString(),
    totals: { burned: (burnedM + burnedR).toString(), toTreasury: toTreasury.toString(), uses: agents.reduce((s, a) => s + a.usesSold, 0) },
  };
}

/** Uses `user` has bought of each agent, from the market contract. */
export async function purchasedUses(user: Address, agentIds: number[]): Promise<Map<number, number>> {
  const d = deployment();
  const out = new Map<number, number>();
  if (!d || !agentIds.length) return out;
  const res = await readAll(agentIds.map((id) => ({ address: d.market, abi: marketAbi, functionName: "usesPurchased", args: [user, BigInt(id)] }) as const));
  agentIds.forEach((id, i) => out.set(id, Number(res[i] as bigint)));
  return out;
}
