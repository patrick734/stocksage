import Link from "next/link";
import { brand } from "@/lib/brand";

export const metadata = { title: "How it works" };

export default function How() {
  return (
    <div className="wrap page narrow prose">
      <h1>How StockSage works</h1>
      <p className="lede">An open market for AI agents that explain tokenized stocks, real-world assets and on-chain finance on Robinhood Chain.</p>

      <h2>Use an agent</h2>
      <ol>
        <li>Connect a wallet on Robinhood Chain.</li>
        <li>Pick an agent in the <Link href="/marketplace">marketplace</Link>. Sage, the flagship, is free for a few messages a day.</li>
        <li>For paid agents, buy uses in {brand.token}. One use is one reply. The price is set in ETH by the creator and paid in {brand.token} at the live price.</li>
        <li>Sign a free message so StockSage knows which wallet bought the uses, then chat.</li>
      </ol>
      <p>If a reply fails or the agent declines a request before writing anything, the use is not charged.</p>

      <h2>Create an agent</h2>
      <ol>
        <li>Write its name, description, personality and instructions on the <Link href="/create">Create</Link> page.</li>
        <li>Set a price per use in ETH.</li>
        <li>Deploy: a small fee in {brand.token}, 80% burned and 20% to the treasury.</li>
      </ol>
      <p>Every time someone buys uses of your agent, 60% of the payment goes straight to your wallet in the same transaction. You can change the price or switch your agent off at any time from the <Link href="/dashboard">dashboard</Link>.</p>

      <h2>Where the money goes</h2>
      <table className="table">
        <thead>
          <tr><th>Payment</th><th>Creator</th><th>Burned</th><th>Treasury</th></tr>
        </thead>
        <tbody>
          <tr><td>Buying uses</td><td>60%</td><td>30%</td><td>10%</td></tr>
          <tr><td>Deploying an agent</td><td>–</td><td>80%</td><td>20%</td></tr>
        </tbody>
      </table>
      <p>These splits are constants in the contracts. The treasury is a 48-hour timelock, so treasury funds move only by a public proposal.</p>

      <h2>What the agents are</h2>
      <p>
        Agents are AI models given a creator&apos;s instructions, with StockSage&apos;s rules on top: they give information, not investment advice; they never ask for keys or
        seed phrases; they say what they don&apos;t know. Some can search the web for current information. They can be wrong, so check anything important before
        you act on it.
      </p>

      <h2>Verify an agent</h2>
      <p>Each agent&apos;s configuration is stored as a file whose hash is written on-chain. On any agent page, &quot;Verify&quot; re-hashes the file in your browser and compares it with the chain.</p>

      <h2>Risks</h2>
      <ul>
        <li>{brand.token} is a volatile token. Uses you buy are for chatting with an agent, not an investment.</li>
        <li>Chats run on StockSage&apos;s servers. The contracts record what you bought; serving the replies depends on those servers being up.</li>
        <li>The contracts have not had an independent audit yet.</li>
      </ul>
      <p>
        <Link href="/safety">See the live safety checks →</Link>
      </p>
    </div>
  );
}
