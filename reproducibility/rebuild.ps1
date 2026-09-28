# VeriSync Protocol v1.0 - Windows PowerShell Rebuild Script
$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "VeriSync Protocol v1.0 - Clean Rebuild" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

Write-Host "[1/6] Compiling Circom circuit..." -ForegroundColor Yellow
$circomPath = "circom"
if (-not (Get-Command circom -ErrorAction SilentlyContinue)) {
    if (Test-Path "C:\Users\Lenovo\.cargo\bin\circom.exe") {
        $circomPath = "C:\Users\Lenovo\.cargo\bin\circom.exe"
    }
}
& $circomPath circuits/bridge_verifier.circom --r1cs --wasm --sym -o circuits/

Write-Host "[2/6] Setting up Groth16 proving keys..." -ForegroundColor Yellow
npx snarkjs groth16 setup circuits/bridge_verifier.r1cs pot12_final.ptau circuits/bridge_0000.zkey
npx snarkjs zkey contribute circuits/bridge_0000.zkey circuits/bridge_final.zkey --name="Verisync" -v -e="verisync_reproducible_phase_setup"

Write-Host "[3/6] Exporting verification key..." -ForegroundColor Yellow
npx snarkjs zkey export verificationkey circuits/bridge_final.zkey circuits/verification_key.json

Write-Host "[4/6] Exporting Solidity verifier..." -ForegroundColor Yellow
npx snarkjs zkey export solidityverifier circuits/bridge_final.zkey contracts/Verifier.sol

Write-Host "[5/6] Compiling smart contracts..." -ForegroundColor Yellow
npx hardhat compile

Write-Host "[6/6] Running automated test suite..." -ForegroundColor Yellow
npx hardhat test

Write-Host "==========================================" -ForegroundColor Green
Write-Host "Rebuild complete and all tests passed!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
