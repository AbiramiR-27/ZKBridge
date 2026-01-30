"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ExternalLink, Copy, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";

interface DepositData {
  depositId: string;
  sender: string;
  token: string;
  amount: string;
  recipient: string;
  commitment: string;
  timestamp: number;
  salt: string;
  nullifierSecret: string;
  txHash: string;
  status: "pending" | "processing" | "completed" | "failed";
}

const statusConfig = {
  pending: { 
    label: "Pending", 
    variant: "secondary" as const,
    icon: Clock 
  },
  processing: { 
    label: "Processing", 
    variant: "default" as const,
    icon: Loader2 
  },
  completed: { 
    label: "Completed", 
    variant: "default" as const,
    icon: CheckCircle2 
  },
  failed: { 
    label: "Failed", 
    variant: "destructive" as const,
    icon: XCircle 
  },
};

// Sample data for demonstration
const sampleDeposits: DepositData[] = [
  {
    depositId: "1",
    sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f8fEda",
    token: "0x1234567890123456789012345678901234567890",
    amount: "100000000000000000000",
    recipient: "0x742d35Cc6634C0532925a3b844Bc9e7595f8fEda",
    commitment: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    timestamp: Date.now() / 1000 - 3600,
    salt: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    nullifierSecret: "12345678901234567890123456789012345678901234567890",
    txHash: "0xabc123def456789abc123def456789abc123def456789abc123def456789abc1",
    status: "completed",
  },
  {
    depositId: "2",
    sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f8fEda",
    token: "0x1234567890123456789012345678901234567890",
    amount: "50000000000000000000",
    recipient: "0x9876543210987654321098765432109876543210",
    commitment: "0x123abc456def789012345abc456def789012345abc456def789012345abc456d",
    timestamp: Date.now() / 1000 - 1800,
    salt: "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
    nullifierSecret: "98765432109876543210987654321098765432109876543210",
    txHash: "0xdef789abc123456def789abc123456def789abc123456def789abc123456def7",
    status: "processing",
  },
  {
    depositId: "3",
    sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f8fEda",
    token: "0x1234567890123456789012345678901234567890",
    amount: "25000000000000000000",
    recipient: "0x742d35Cc6634C0532925a3b844Bc9e7595f8fEda",
    commitment: "0x789def012345abc789def012345abc789def012345abc789def012345abc789d",
    timestamp: Date.now() / 1000 - 300,
    salt: "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    nullifierSecret: "11111111111111111111111111111111111111111111111111",
    txHash: "0x456abc789def012456abc789def012456abc789def012456abc789def012456a",
    status: "pending",
  },
];

export function TransactionHistory() {
  const [selectedDeposit, setSelectedDeposit] = useState<DepositData | null>(null);
  const deposits = sampleDeposits;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatAmount = (amount: string) => {
    try {
      const value = BigInt(amount);
      const formatted = Number(value) / 1e18;
      return formatted.toFixed(4);
    } catch {
      return amount;
    }
  };

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor(Date.now() / 1000 - timestamp);
    if (seconds < 60) return `${seconds} seconds ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
  };

  if (deposits.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Transaction History</CardTitle>
          <CardDescription>Your bridge transactions will appear here</CardDescription>
        </CardHeader>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">No transactions yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground">Transaction History</CardTitle>
        <CardDescription>
          {deposits.length} transaction{deposits.length !== 1 ? "s" : ""} found
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="text-muted-foreground">ID</TableHead>
              <TableHead className="text-muted-foreground">Amount</TableHead>
              <TableHead className="text-muted-foreground">Recipient</TableHead>
              <TableHead className="text-muted-foreground">Time</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deposits.map((deposit) => {
              const status = statusConfig[deposit.status];
              const StatusIcon = status.icon;
              
              return (
                <TableRow key={deposit.depositId} className="border-border">
                  <TableCell className="font-mono text-sm">
                    #{deposit.depositId}
                  </TableCell>
                  <TableCell>
                    {formatAmount(deposit.amount)} tokens
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {deposit.recipient.slice(0, 6)}...{deposit.recipient.slice(-4)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatTimeAgo(deposit.timestamp)}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={status.variant}
                      className="gap-1"
                    >
                      <StatusIcon className={`w-3 h-3 ${deposit.status === "processing" ? "animate-spin" : ""}`} />
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setSelectedDeposit(deposit)}
                        >
                          View Details
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-card border-border max-w-lg">
                        <DialogHeader>
                          <DialogTitle className="text-foreground">
                            Deposit #{selectedDeposit?.depositId}
                          </DialogTitle>
                          <DialogDescription>
                            Transaction details and proof data
                          </DialogDescription>
                        </DialogHeader>
                        
                        {selectedDeposit && (
                          <div className="space-y-4 mt-4">
                            {/* Status */}
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Status</span>
                              <Badge variant={statusConfig[selectedDeposit.status].variant}>
                                {statusConfig[selectedDeposit.status].label}
                              </Badge>
                            </div>

                            {/* Amount */}
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Amount</span>
                              <span className="text-foreground font-medium">
                                {formatAmount(selectedDeposit.amount)} tokens
                              </span>
                            </div>

                            {/* Recipient */}
                            <div>
                              <span className="text-muted-foreground text-sm">Recipient</span>
                              <div className="flex items-center gap-2 mt-1">
                                <code className="text-xs bg-secondary px-2 py-1 rounded flex-1 overflow-hidden text-ellipsis">
                                  {selectedDeposit.recipient}
                                </code>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => copyToClipboard(selectedDeposit.recipient)}
                                >
                                  <Copy className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>

                            {/* Commitment */}
                            <div>
                              <span className="text-muted-foreground text-sm">Commitment Hash</span>
                              <div className="flex items-center gap-2 mt-1">
                                <code className="text-xs bg-secondary px-2 py-1 rounded flex-1 overflow-hidden text-ellipsis">
                                  {selectedDeposit.commitment}
                                </code>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => copyToClipboard(selectedDeposit.commitment)}
                                >
                                  <Copy className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>

                            {/* Salt */}
                            <div>
                              <span className="text-muted-foreground text-sm">
                                Salt <span className="text-chart-5">(Save this!)</span>
                              </span>
                              <div className="flex items-center gap-2 mt-1">
                                <code className="text-xs bg-secondary px-2 py-1 rounded flex-1 overflow-hidden text-ellipsis">
                                  {selectedDeposit.salt}
                                </code>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => copyToClipboard(selectedDeposit.salt)}
                                >
                                  <Copy className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>

                            {/* Nullifier Secret */}
                            <div>
                              <span className="text-muted-foreground text-sm">
                                Nullifier Secret <span className="text-chart-5">(Save this!)</span>
                              </span>
                              <div className="flex items-center gap-2 mt-1">
                                <code className="text-xs bg-secondary px-2 py-1 rounded flex-1 overflow-hidden text-ellipsis">
                                  {selectedDeposit.nullifierSecret}
                                </code>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => copyToClipboard(selectedDeposit.nullifierSecret)}
                                >
                                  <Copy className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>

                            {/* Transaction Link */}
                            {selectedDeposit.txHash && (
                              <div className="pt-4 border-t border-border">
                                <a
                                  href={`https://sepolia.etherscan.io/tx/${selectedDeposit.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-primary hover:underline text-sm"
                                >
                                  View on Etherscan
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              </div>
                            )}
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
