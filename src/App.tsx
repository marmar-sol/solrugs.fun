import React, { useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  WalletMultiButton,
  WalletDisconnectButton
} from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletContext } from "./WalletContextProvider";

const SOLANA_MAINNET = "https://api.mainnet-beta.solana.com";
const FEE_BPS = 50; // 0.5%
const FEE_ACCOUNT = "C7xVEy4THaBQzNiBMgwm6ewsG4Y1AkpRGURtHnpRid7R"; // Main wallet address

function App() {
  const { publicKey, connected, signTransaction, sendTransaction, connection } = useWalletContext();
  const [tokens, setTokens] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!publicKey) return;

    const fetchTokens = async () => {
      const accounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
      });

      const rawTokens = accounts.value
        .map(({ pubkey, account }) => {
          const info = account.data.parsed.info;
          return {
            pubkey,
            mint: info.mint,
            amount: parseFloat(info.tokenAmount.uiAmountString || "0"),
            decimals: info.tokenAmount.decimals
          };
        })
        .filter((t) => t.amount > 0);

      const tokensWithValue = await Promise.all(
        rawTokens.map(async (t) => {
          try {
            const amountInSmallestUnits = Math.floor(t.amount * 10 ** t.decimals);
            const quoteRes = await fetch(
              `https://quote-api.jup.ag/v6/quote?inputMint=${t.mint}&outputMint=So11111111111111111111111111111111111111112&amount=${amountInSmallestUnits}`
            );
            const quote = await quoteRes.json();
            const valueInSOL = quote.outAmount / 10 ** 9;
            return { ...t, valueInSOL };
          } catch (err) {
            return { ...t, valueInSOL: 0 };
          }
        })
      );

      setTokens(tokensWithValue);
    };

    fetchTokens();
  }, [publicKey]);

  const handleToggle = (mint: string) => {
    setSelected((prev) =>
      prev.includes(mint) ? prev.filter((m) => m !== mint) : [...prev, mint]
    );
  };

  const handleSwapAll = async () => {
    if (!connected || !publicKey) return;

    for (const token of tokens.filter((t) => selected.includes(t.mint))) {
      try {
        const amount = Math.floor(token.amount * 10 ** token.decimals);
        const route = await fetch(
          `https://quote-api.jup.ag/v6/quote?inputMint=${token.mint}&outputMint=So11111111111111111111111111111111111111112&amount=${amount}&feeBps=${FEE_BPS}`
        ).then((res) => res.json());

        const swapTx = await fetch("https://quote-api.jup.ag/v6/swap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            route,
            userPublicKey: publicKey.toBase58(),
            wrapUnwrapSOL: true,
            feeAccount: FEE_ACCOUNT
          })
        }).then((res) => res.json());

        const txBuf = Buffer.from(swapTx.swapTransaction, "base64");
        const tx = await connection.deserializeTransaction(txBuf);

        const signed = await signTransaction!(tx);
        const txid = await sendTransaction!(signed, connection);
        await connection.confirmTransaction(txid);
        console.log("Swapped", token.mint, "txid:", txid);
      } catch (err) {
        console.error("Swap failed for", token.mint, err);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Solrugs Mass Swapper</h1>
        <div className="flex gap-2">
          <WalletMultiButton />
          <WalletDisconnectButton />
        </div>
      </div>

      {connected ? (
        <div className="mt-6">
          <h2 className="text-xl mb-4">Select Tokens to Swap:</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {tokens.map((token) => (
              <li
                key={token.mint}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selected.includes(token.mint) ? "bg-green-600 border-green-300" : "bg-gray-800 border-gray-600"
                }`}
                onClick={() => handleToggle(token.mint)}
              >
                <p><strong>Mint:</strong> {token.mint}</p>
                <p><strong>Amount:</strong> {token.amount}</p>
                <p><strong>Value in SOL:</strong> {token.valueInSOL.toFixed(6)}</p>
              </li>
            ))}
          </ul>
          <button
            onClick={handleSwapAll}
            className="mt-6 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-lg font-semibold"
          >
            Swap Selected to SOL
          </button>
        </div>
      ) : (
        <p className="mt-10 text-lg">Connect your wallet to start.</p>
      )}
    </div>
  );
}

export default App;
