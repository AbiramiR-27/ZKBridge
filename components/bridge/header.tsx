"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Wallet, LogOut, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function BridgeHeader() {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [chainName, setChainName] = useState<string>("Sepolia");
  const [isConnecting, setIsConnecting] = useState(false);

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const connect = async () => {
    if (typeof window === "undefined" || !(window as Window & { ethereum?: unknown }).ethereum) {
      alert("Please install MetaMask to use this application");
      return;
    }

    setIsConnecting(true);
    try {
      const ethereum = (window as Window & { ethereum?: { request: (args: { method: string }) => Promise<string[]> } }).ethereum;
      if (!ethereum) return;
      
      const accounts = await ethereum.request({
        method: "eth_requestAccounts",
      });
      
      if (accounts.length > 0) {
        setAddress(accounts[0]);
        setIsConnected(true);
      }
    } catch (error) {
      console.error("Connection error:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    setAddress(null);
    setIsConnected(false);
  };

  const switchChain = (chain: string) => {
    setChainName(chain);
  };

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-lg">V</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">VeriSync</h1>
            <p className="text-xs text-muted-foreground">ZK Bridge Verifier</p>
          </div>
        </div>

        {/* Connection */}
        <div className="flex items-center gap-3">
          {isConnected && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="bg-transparent gap-2">
                  <div className="w-2 h-2 rounded-full bg-chart-3" />
                  {chainName}
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => switchChain("Ethereum Sepolia")}>
                  <div className="w-2 h-2 rounded-full bg-chart-1 mr-2" />
                  Ethereum Sepolia
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => switchChain("Polygon Amoy")}>
                  <div className="w-2 h-2 rounded-full bg-accent mr-2" />
                  Polygon Amoy
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {isConnected ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="gap-2">
                  <Wallet className="w-4 h-4" />
                  {formatAddress(address!)}
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={disconnect} className="text-destructive">
                  <LogOut className="w-4 h-4 mr-2" />
                  Disconnect
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button onClick={connect} disabled={isConnecting} className="gap-2">
              <Wallet className="w-4 h-4" />
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
