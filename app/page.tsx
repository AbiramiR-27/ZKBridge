"use client";

import { BridgeHeader } from "@/components/bridge/header";
import { DepositForm } from "@/components/bridge/deposit-form";
import { TransactionHistory } from "@/components/bridge/transaction-history";
import { StatsCards } from "@/components/bridge/stats-cards";
import { ArchitectureDiagram } from "@/components/bridge/architecture-diagram";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, History, Info } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <BridgeHeader />
      
      <main className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4 text-balance">
            VeriSync
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto text-balance">
            Cross-chain token bridging with Zero-Knowledge proof verification.
            Trustless, secure, and privacy-preserving.
          </p>
        </div>

        {/* Stats */}
        <div className="mb-8">
          <StatsCards 
            totalDeposits={12}
            totalClaims={10}
            pendingCount={2}
          />
        </div>

        {/* Main Content */}
        <Tabs defaultValue="bridge" className="space-y-6">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-3 bg-secondary">
            <TabsTrigger value="bridge" className="gap-2 data-[state=active]:bg-card">
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Bridge</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2 data-[state=active]:bg-card">
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">History</span>
            </TabsTrigger>
            <TabsTrigger value="info" className="gap-2 data-[state=active]:bg-card">
              <Info className="w-4 h-4" />
              <span className="hidden sm:inline">How it Works</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bridge">
            <div className="max-w-xl mx-auto">
              <DepositForm />
            </div>
          </TabsContent>

          <TabsContent value="history">
            <TransactionHistory />
          </TabsContent>

          <TabsContent value="info">
            <ArchitectureDiagram />
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <footer className="mt-16 py-8 border-t border-border text-center text-muted-foreground">
          <p className="text-sm">
            VeriSync - ZK International Bridge Verifier System
          </p>
          <p className="text-xs mt-2">
            Built with Circom, SnarkJS, Solidity, and Next.js
          </p>
        </footer>
      </main>
    </div>
  );
}
