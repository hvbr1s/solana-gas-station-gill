import { buildTransferTokensTransaction } from "gill/programs/token";
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { FordefiSolanaConfig } from './config'
import * as kit from '@solana/kit';
import * as gill from 'gill'


global.__GILL_DEBUG__ = true

const { rpc, sendAndConfirmTransaction } = gill.createSolanaClient({
  urlOrMoniker: "mainnet",
});

export async function signFeePayerVault(fordefiConfig: FordefiSolanaConfig): Promise<any>{
    const sourceVault = gill.address(fordefiConfig.originAddress)
    const sourceVaultSigner = gill.createNoopSigner(sourceVault)
    const destVault = gill.address(fordefiConfig.destAddress)
    const feePayer = gill.address(fordefiConfig.feePayer)
    const feePayerSigner =  gill.createNoopSigner(feePayer)
    const mint = gill.address(fordefiConfig.tokenMint)
    console.debug("Source vault -> ", sourceVault)
    console.debug("Dest vault -> ", destVault)
    console.debug("Fee payer -> ", feePayer)

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    
    let transferTokensTx = await buildTransferTokensTransaction({
      feePayer: feePayerSigner,
      latestBlockhash,
      mint,
      authority: sourceVaultSigner,
      amount: fordefiConfig.amount,
      destination: destVault,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
      computeUnitLimit: 100_000
    });

    const ix = transferTokensTx.instructions
    const tokenTransferIxIndex = ix.findIndex(instruction => instruction.programAddress === TOKEN_PROGRAM_ADDRESS);
    if (tokenTransferIxIndex !== -1) {
      const tokenTransferIx = ix[tokenTransferIxIndex];
      if (tokenTransferIx && tokenTransferIx.accounts) {
        const updatedAccounts = [...tokenTransferIx.accounts];
        
        // make source ATA account (index 2) writable
        if (updatedAccounts[2]) {
          updatedAccounts[2] = { 
            ...updatedAccounts[2],
            role: kit.upgradeRoleToWritable(updatedAccounts[2].role)
          };
        }
        // new Tx with updated roles
        transferTokensTx = {
          ...transferTokensTx,
          instructions: transferTokensTx.instructions.map((instr, i) => 
            i === tokenTransferIxIndex ? { ...tokenTransferIx, accounts: updatedAccounts } : instr
          )
        };
      }
    }
    
    const partiallySignedTx = await gill.partiallySignTransactionMessageWithSigners(transferTokensTx);
    console.log("Signed transaction: ", partiallySignedTx)
    const base64EncodedData = Buffer.from(partiallySignedTx.messageBytes).toString('base64');

    console.debug("Raw data ->", base64EncodedData)
    
    const jsonBody = {
        "vault_id": fordefiConfig.feePayerVault,
        "signer_type": "api_signer",
        "sign_mode": "auto",
        "type": "solana_transaction",
        "details": {
            "skip_prediction": false,
            "type": "solana_serialized_transaction_message",
            "push_mode": "manual",
            "chain": "solana_mainnet",
            "data": base64EncodedData,
        },
        "wait_for_state": "signed"
    };

    return [jsonBody, base64EncodedData];
}

export async function signWithSourceVault(fordefiConfig: FordefiSolanaConfig, feePayerSignature: any, msgData: any, priorityFee?: number): Promise<any> {  
  const jsonBody = {
      "vault_id": fordefiConfig.originVault, 
      "signer_type": "api_signer",
      "sign_mode": "auto",
      "type": "solana_transaction",
      "details": {
          "skip_prediction": false,
          "type": "solana_serialized_transaction_message",
          "push_mode": "auto",
          "chain": "solana_mainnet",
          "data": msgData,
          "signatures":[
              {data: feePayerSignature},
              {data: null}
          ]
      },
      "wait_for_state": "signed"
  };

  return jsonBody;
}