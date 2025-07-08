import { signFeePayerVault, signWithSourceVault} from './serialize-spl';
import { createAndSignTx } from '../utils/process_tx';
import { signWithApiSigner } from './signer';
import { fordefiConfig } from './config';


async function main(): Promise<void> {
  if (!fordefiConfig.accessToken) {
    console.error('Error: FORDEFI_API_TOKEN environment variable is not set');
    return;
  }

  const [jsonBody, msgData] = await signFeePayerVault(fordefiConfig);
  const requestBody = JSON.stringify(jsonBody);
  const timestamp = new Date().getTime();
  const feePayerVaultPayload = `${fordefiConfig.apiPathEndpoint}|${timestamp}|${requestBody}`;
  const feePayerVaultSignature = await signWithApiSigner(feePayerVaultPayload, fordefiConfig.privateKeyPem);

  console.log("check!")

  const response = await createAndSignTx(
    fordefiConfig.apiPathEndpoint, 
    fordefiConfig.accessToken, 
    feePayerVaultSignature, 
    timestamp, 
    requestBody
  );
  const data = response.data;
  console.log(data)
  console.log("Transaction submitted to Fordefi for broadcast ✅")
  console.log(`Transaction ID: ${data.id}`)
  console.log("First sig ->", data.signatures[0])

  try {
    await new Promise(resolve => setTimeout(resolve, 2000));
    // Create payload for source Vault signature
    const sourceVaultRequest = await signWithSourceVault(fordefiConfig, data.signatures[0], msgData);
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