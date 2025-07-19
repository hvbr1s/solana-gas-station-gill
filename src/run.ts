import { signFeePayerVault, signWithSourceVault} from './serialize-spl';
import { createAndSignTx } from '../utils/process_tx';
import { signWithApiSigner } from './signer';
import { transactionFromBase64 } from 'gill';
import { fordefiConfig } from './config';
import axios from 'axios';


async function main(): Promise<void> {
  if (!fordefiConfig.accessToken) {
    console.error('Error: FORDEFI_API_TOKEN environment variable is not set');
    return;
  }

  const jsonBody = await signFeePayerVault(fordefiConfig);
  const requestBody = JSON.stringify(jsonBody);
  const timestamp = new Date().getTime();
  const feePayerVaultPayload = `${fordefiConfig.apiPathEndpoint}|${timestamp}|${requestBody}`;
  const feePayerVaultSignature = await signWithApiSigner(feePayerVaultPayload, fordefiConfig.privateKeyPem);

  const response = await createAndSignTx(
    fordefiConfig.apiPathEndpoint, 
    fordefiConfig.accessToken, 
    feePayerVaultSignature, 
    timestamp, 
    requestBody
  );
  console.log("Transaction submitted to Fordefi for broadcast ✅")
  await new Promise(resolve => setTimeout(resolve, 2000));
  const signedFordefiTx = await axios.get(`https://api.fordefi.com/api/v1/transactions/${response.data.id}`, {
    headers: {
      'Authorization': `Bearer ${fordefiConfig.accessToken}`
    }
  });
  const fordefiPartialTx = await transactionFromBase64(signedFordefiTx.data.raw_transaction);
  const compiledPartialTx = fordefiPartialTx.messageBytes;

  const transactionData = {
      messageBytes: compiledPartialTx,
      signatures: signedFordefiTx.data.signatures.map((signature: any) => signature.data ? Buffer.from(signature.data, 'base64') : null)
  }
  const serializedMessage = Buffer.from(
      transactionData.messageBytes
  ).toString('base64');
  const signatures = transactionData.signatures.map((x: any) => ({ data: x instanceof Buffer ? x.toString('base64') : null }))
  
  try {
    // Create payload for source Vault signature
    const sourceVaultRequest = await signWithSourceVault(fordefiConfig, signatures, serializedMessage);
    const sourceVaultRequestBody = JSON.stringify(sourceVaultRequest);
    const sourceVaultTimestamp = new Date().getTime();
    const sourceVaultPayload = `${fordefiConfig.apiPathEndpoint}|${sourceVaultTimestamp}|${sourceVaultRequestBody}`;
    const sourceVaultSignature = await signWithApiSigner(sourceVaultPayload, fordefiConfig.privateKeyPem);
    
    // Send the second request to Fordefi for the source vault to sign and broadcast
    const finalResponse = await createAndSignTx(
      fordefiConfig.apiPathEndpoint,
      fordefiConfig.accessToken, 
      sourceVaultSignature,
      sourceVaultTimestamp,
      sourceVaultRequestBody
    );
    console.debug(finalResponse.data)

    console.log("Transaction signed by source vault and submitted to network ✅");
    console.log(`Final transaction ID: ${finalResponse.data.id}`);

  } catch (error: any) {
    console.error(`Failed to sign the transaction: ${error.message}`);
  }
}

if (require.main === module) {
  main();
}