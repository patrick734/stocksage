import { parseAbiItem, type Address } from "viem";
import { deployment, publicClient } from "@/lib/server/chain";
import { json, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const deployed = parseAbiItem(
  "event AgentDeployed(uint256 indexed agentId, address indexed creator, string name, uint256 pricePerUseWei, bytes32 configHash, string metadataURI, uint256 tokenPaid, uint256 tokenBurned)"
);
const purchased = parseAbiItem(
  "event UsesPurchased(address indexed user, uint256 indexed agentId, uint256 uses, uint256 tokenPaid, uint256 toCreator, uint256 burned, uint256 toTreasury)"
);
const CHUNK = 400_000n;
const MAX_CHUNKS = 12;
const WANT = 60;

type Item =
  | { kind: "deployed"; block: number; tx: string; agentId: number; who: Address; name: string; paid: string; burned: string }
  | { kind: "purchased"; block: number; tx: string; agentId: number; who: Address; uses: number; paid: string; burned: string };

let cache: { at: number; items: Item[] } | null = null;

/** Recent agent deployments and use purchases, newest first, read from on-chain events. */
export const GET = route(async () => {
  const d = deployment();
  if (!d) return json({ items: [] });
  if (cache && Date.now() - cache.at < 30_000) return json({ items: cache.items });
  const c = publicClient();
  const head = await c.getBlockNumber();
  const start = BigInt(d.deployBlock ?? d.startBlock ?? 0);
  const items: Item[] = [];
  for (let to = head, i = 0; to >= start && i < MAX_CHUNKS && items.length < WANT; i++) {
    const from = to - CHUNK + 1n > start ? to - CHUNK + 1n : start;
    const [a, b] = await Promise.all([
      c.getLogs({ address: d.registry, event: deployed, fromBlock: from, toBlock: to }),
      c.getLogs({ address: d.market, event: purchased, fromBlock: from, toBlock: to }),
    ]);
    for (const l of a)
      items.push({ kind: "deployed", block: Number(l.blockNumber), tx: l.transactionHash, agentId: Number(l.args.agentId), who: l.args.creator!, name: l.args.name!, paid: String(l.args.tokenPaid), burned: String(l.args.tokenBurned) });
    for (const l of b)
      items.push({ kind: "purchased", block: Number(l.blockNumber), tx: l.transactionHash, agentId: Number(l.args.agentId), who: l.args.user!, uses: Number(l.args.uses), paid: String(l.args.tokenPaid), burned: String(l.args.burned) });
    to = from - 1n;
  }
  items.sort((x, y) => y.block - x.block);
  cache = { at: Date.now(), items: items.slice(0, WANT) };
  return json({ items: cache.items });
});
