"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowRight, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export function DepositForm() {
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [depositData, setDepositData] = useState<{
    depositId: string;
    commitment: string;
  } | null>(null);

  const isConnected = typeof window !== "undefined" && !!(window as Window & { ethereum?: unknown }).ethereum;

  const handleDeposit = async () => {
    if (!amount || !recipient || !tokenAddress) {
      setError("Please fill in all fields");
      return;
    }

    // Validate addresses
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
      setError("Invalid recipient address");
      return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
      setError("Invalid token address");
      return;
    }

    setIsLoading(true);
    setError(null);
    setTxHash(null);
    setDepositData(null);

    try {
      // Simulated deposit flow - in production this would interact with the smart contract
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Generate mock data
      const mockTxHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
      const mockDepositId = Math.floor(Math.random() * 1000).toString();
      const mockCommitment = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
      
      setTxHash(mockTxHash);
      setDepositData({
        depositId: mockDepositId,
        commitment: mockCommitment,
      });

    } catch (err) {
      console.error("Deposit error:", err);
      setError(err instanceof Error ? err.message : "Failed to execute deposit");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFaucet = async () => {
    if (!tokenAddress || !/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
      setError("Enter a valid token address first");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      alert("100 tokens received from faucet!");
    } catch (err) {
      console.error("Faucet error:", err);
      setError(err instanceof Error ? err.message : "Faucet failed");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Connect your wallet to start bridging</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground">Bridge Tokens</CardTitle>
        <CardDescription>
          Lock tokens on Sepolia and receive them on Polygon Amoy
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Chain Flow */}
        <div className="flex items-center justify-center gap-4 py-4 bg-secondary/50 rounded-lg">
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-chart-1/20 flex items-center justify-center mx-auto mb-2">
              <span className="text-chart-1 font-semibold">ETH</span>
            </div>
            <p className="text-sm text-muted-foreground">Sepolia</p>
          </div>
          <ArrowRight className="w-6 h-6 text-primary" />
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-2">
              <span className="text-accent font-semibold">POL</span>
            </div>
            <p className="text-sm text-muted-foreground">Amoy</p>
          </div>
        </div>

        {/* Token Address */}
        <div className="space-y-2">
          <Label htmlFor="token">Token Address</Label>
          <div className="flex gap-2">
            <Input
              id="token"
              placeholder="0x..."
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
              disabled={isLoading}
              className="flex-1"
            />
            <Button 
              variant="outline" 
              onClick={handleFaucet}
              disabled={isLoading || !tokenAddress}
              className="bg-transparent"
            >
              Faucet
            </Button>
          </div>
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            type="number"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isLoading}
          />
        </div>

        {/* Recipient */}
        <div className="space-y-2">
          <Label htmlFor="recipient">Recipient Address (on Polygon Amoy)</Label>
          <Input
            id="recipient"
            placeholder="0x..."
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            disabled={isLoading}
          />
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setRecipient("0x742d35Cc6634C0532925a3b844Bc9e7595f8fEda")}
            className="text-xs text-muted-foreground"
          >
            Use sample address
          </Button>
        </div>

        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Success */}
        {depositData && (
          <Alert className="border-chart-3 bg-chart-3/10">
            <CheckCircle2 className="h-4 w-4 text-chart-3" />
            <AlertDescription className="text-chart-3">
              <p className="font-semibold">Deposit Successful!</p>
              <p className="text-sm mt-2">Deposit ID: {depositData.depositId}</p>
              <p className="text-xs mt-1 break-all">Commitment: {depositData.commitment}</p>
              <p className="text-xs mt-2 text-muted-foreground">
                The relayer will generate a ZK proof and relay to the destination chain.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Transaction Hash */}
        {txHash && (
          <div className="text-sm text-muted-foreground">
            <span>Transaction: </span>
            <a 
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {txHash.slice(0, 10)}...{txHash.slice(-8)}
            </a>
          </div>
        )}

        {/* Submit Button */}
        <Button 
          onClick={handleDeposit} 
          disabled={isLoading || !amount || !recipient || !tokenAddress}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              Bridge Tokens
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
