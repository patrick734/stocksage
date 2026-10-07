import { deployments, type Deployment } from "@/generated/deployments";
import { defaultChainId } from "./wagmi";

/** The deployment the app reads and writes. Writes always target this chain, whatever the wallet is on. */
export function useDeployment(): { deployment: Deployment | null; chainId: typeof defaultChainId } {
  return { deployment: deployments[defaultChainId] ?? null, chainId: defaultChainId };
}
