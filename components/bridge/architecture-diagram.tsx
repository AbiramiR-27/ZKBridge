"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Lock, Unlock, Shield, Server } from "lucide-react";

export function ArchitectureDiagram() {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground">How It Works</CardTitle>
        <CardDescription>
          Zero-Knowledge proof verification flow across chains
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col lg:flex-row items-center justify-between gap-6 py-8">
          {/* Source Chain */}
          <div className="flex flex-col items-center text-center p-6 bg-secondary/50 rounded-xl flex-1 max-w-xs">
            <div className="w-16 h-16 rounded-full bg-chart-1/20 flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-chart-1" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Source Chain</h3>
            <p className="text-sm text-muted-foreground mb-2">Ethereum Sepolia</p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>1. User locks tokens</p>
              <p>2. Commitment hash emitted</p>
              <p>3. Event captured by relayer</p>
            </div>
          </div>

          {/* Arrow */}
          <div className="hidden lg:flex items-center">
            <ArrowRight className="w-8 h-8 text-muted-foreground" />
          </div>

          {/* ZK Proof Generation */}
          <div className="flex flex-col items-center text-center p-6 bg-primary/10 rounded-xl flex-1 max-w-xs border-2 border-primary/30">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">ZK Proof Generator</h3>
            <p className="text-sm text-muted-foreground mb-2">Relayer Service</p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>4. Generate ZK-SNARK proof</p>
              <p>5. Prove validity without</p>
              <p>revealing private data</p>
            </div>
          </div>

          {/* Arrow */}
          <div className="hidden lg:flex items-center">
            <ArrowRight className="w-8 h-8 text-muted-foreground" />
          </div>

          {/* Destination Chain */}
          <div className="flex flex-col items-center text-center p-6 bg-secondary/50 rounded-xl flex-1 max-w-xs">
            <div className="w-16 h-16 rounded-full bg-chart-3/20 flex items-center justify-center mb-4">
              <Unlock className="w-8 h-8 text-chart-3" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Destination Chain</h3>
            <p className="text-sm text-muted-foreground mb-2">Polygon Amoy</p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>6. Verify ZK proof on-chain</p>
              <p>7. Check nullifier unused</p>
              <p>8. Release/mint tokens</p>
            </div>
          </div>
        </div>

        {/* Security Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 pt-8 border-t border-border">
          <div className="text-center">
            <h4 className="font-medium text-foreground mb-1">Replay Protection</h4>
            <p className="text-xs text-muted-foreground">
              Nullifiers prevent double-spending
            </p>
          </div>
          <div className="text-center">
            <h4 className="font-medium text-foreground mb-1">Proof Expiration</h4>
            <p className="text-xs text-muted-foreground">
              Time-limited validity window
            </p>
          </div>
          <div className="text-center">
            <h4 className="font-medium text-foreground mb-1">Trustless Verification</h4>
            <p className="text-xs text-muted-foreground">
              No third-party bridge required
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
