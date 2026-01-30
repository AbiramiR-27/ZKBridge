@echo off
REM ===========================================
REM VeriSync - ZK International Bridge Verifier System
REM Zero-Knowledge Proof Setup Script (Windows)
REM ===========================================
REM 
REM PREREQUISITES:
REM - Node.js v18+
REM - Circom installed and in PATH
REM - SnarkJS installed globally (npm install -g snarkjs)
REM
REM USAGE:
REM setup.bat
REM ===========================================

echo ===========================================
echo VeriSync - ZK Proof Setup (Windows)
echo ===========================================
echo.

REM Create output directory
if not exist "build" mkdir build

REM Step 1: Compile the circuit
echo [1/7] Compiling circuit...
circom bridge_verifier.circom --r1cs --wasm --sym -o build
if errorlevel 1 goto error
echo    Circuit compiled successfully!

REM Step 2: Download Powers of Tau (manual step for Windows)
echo.
echo [2/7] Checking Powers of Tau...
if not exist "powersOfTau28_hez_final_12.ptau" (
    echo    Please download Powers of Tau manually:
    echo    https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_12.ptau
    echo    Place it in the circuits directory and run this script again.
    pause
    exit /b 1
)
echo    Powers of Tau file found.

REM Step 3: Generate initial zkey
echo.
echo [3/7] Generating initial zkey (Phase 1)...
call snarkjs groth16 setup build\bridge_verifier.r1cs powersOfTau28_hez_final_12.ptau build\bridge_verifier_0000.zkey
if errorlevel 1 goto error

REM Step 4: Contribute to the ceremony (Phase 2)
echo.
echo [4/7] Contributing to ceremony (Phase 2)...
call snarkjs zkey contribute build\bridge_verifier_0000.zkey build\bridge_verifier_0001.zkey --name="First contribution" -v -e="random entropy string for verisync setup"
if errorlevel 1 goto error

REM Step 5: Apply random beacon (Final Phase)
echo.
echo [5/7] Applying random beacon...
call snarkjs zkey beacon build\bridge_verifier_0001.zkey build\bridge_verifier_final.zkey 0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f 10 -n="Final Beacon phase2"
if errorlevel 1 goto error

REM Step 6: Export verification key
echo.
echo [6/7] Exporting verification key...
call snarkjs zkey export verificationkey build\bridge_verifier_final.zkey build\verification_key.json
if errorlevel 1 goto error

REM Step 7: Export Solidity verifier
echo.
echo [7/7] Exporting Solidity verifier...
call snarkjs zkey export solidityverifier build\bridge_verifier_final.zkey ..\contracts\Verifier.sol
if errorlevel 1 goto error

REM Verify the setup
echo.
echo ===========================================
echo Verifying setup...
echo ===========================================
call snarkjs zkey verify build\bridge_verifier.r1cs powersOfTau28_hez_final_12.ptau build\bridge_verifier_final.zkey
if errorlevel 1 goto error

echo.
echo ===========================================
echo SETUP COMPLETE!
echo ===========================================
echo.
echo Generated files:
echo   - build\bridge_verifier.r1cs      (Constraint system)
echo   - build\bridge_verifier_js\       (WASM for proof generation)
echo   - build\bridge_verifier_final.zkey (Proving key)
echo   - build\verification_key.json     (Verification key)
echo   - ..\contracts\Verifier.sol       (Solidity verifier)
echo.
echo Next steps:
echo   1. Deploy the Verifier.sol contract
echo   2. Use the relayer to generate proofs
echo ===========================================

pause
exit /b 0

:error
echo.
echo ERROR: An error occurred during setup.
echo Please check the error message above and try again.
pause
exit /b 1
