import {
  Transaction,
  script,
  Psbt,
  initEccLib,
  networks,
  Signer as BTCSigner,
  crypto,
  payments,
  opcodes,
  address as Address
} from "bitcoinjs-lib";
import { Taptree } from "bitcoinjs-lib/src/types";
import { ECPairFactory, ECPairAPI } from "ecpair";
import ecc from "@bitcoinerlab/secp256k1";
import axios, { AxiosResponse } from "axios";
import networkConfig from "config/network.config";
import { WIFWallet } from 'utils/WIFWallet'
// import { SeedWallet } from "utils/SeedWallet";
import cbor from 'cbor';

const network = networks.testnet;

initEccLib(ecc as any);
const ECPair: ECPairAPI = ECPairFactory(ecc);

export const contentBuffer = (content: string) => {
  return Buffer.from(content, 'utf8')
}

const privateKey: string = process.env.PRIVATE_KEY as string;
const networkType: string = networkConfig.networkType;
const wallet = new WIFWallet({ networkType: networkType, privateKey: privateKey });

const txhash: string = '1bfcfc75338cb542d7f8d265d0d3a82abe7797f9328c5504a50c60b241c8bb88';
const memeType: string = 'text/html;charset=utf-8';
const metaProtocol: Buffer = Buffer.concat([Buffer.from("parcel.bitmap", "utf8")]);
const receiveAddress: string = 'tb1pwc08hjtg4nkaj390u7djryft2z3l4lea4zvepqnpj2adsr4ujzcs3nzcpc';
const metadata = {
  'type': 'Bitmap',
  'description': 'Bitmap Community Parent Ordinal'
}
const fee = 50000;
const contentBufferData: Buffer = contentBuffer(`<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0">
    <canvas id="canvas" style="width: 100%; height: auto;" width="500" height="500"></canvas>
    <script>
        function draw(canvas, rectangleColor, circleColor, text) {
            const ctx = canvas.getContext('2d');

            const rectWidth = 400;
            const rectHeight = 200;
            const circleRadius = 50;
            const rectX = (canvas.width - rectWidth) / 2; 
            const rectY = (canvas.height - rectHeight) / 2; 
            const circleX = canvas.width / 2; 
            const circleY = canvas.height / 2; 

            
            ctx.fillStyle = rectangleColor;
            ctx.fillRect(rectX, rectY, rectWidth, rectHeight);

            
            ctx.fillStyle = circleColor;
            ctx.beginPath();
            ctx.arc(circleX, circleY, circleRadius, 0, Math.PI * 2); 
            ctx.fill();

            
            ctx.fillStyle = '#ffffff'; 
            ctx.font = '20px Arial';
            ctx.textAlign = 'center'; 
            ctx.textBaseline = 'middle'; 
            ctx.fillText(text, circleX, circleY); 
        }

        function getRandomColor() {
            const rgb = [];
            for (let i = 0; i < 3; i++) {
                rgb.push(Math.floor(Math.random() * 256)); 
            return \`rgb(\${rgb.join(',')})\`; 
        }

        const contents = [
            'cap',
            'body',
            'accessories',
        ];

       
        const rectangleColor = getRandomColor();
        const circleColor = getRandomColor();

       
        const randomText = contents[Math.floor(Math.random() * contents.length)];

        
        draw(document.getElementById('canvas'), rectangleColor, circleColor, randomText);
    </script>
</body>
</html>
`);
// const parentInscriptionTXID = '1bfcfc75338cb542d7f8d265d0d3a82abe7797f9328c5504a50c60b241c8bb88'
// const revealtxIDBuffer = Buffer.from(parentInscriptionTXID, 'hex');
// const inscriptionBuffer = revealtxIDBuffer.reverse();
const pointer1: number = 546 * 1;
// const pointer2: number = 546 * 2;
// const pointer3: number = 546 * 3;
const pointerBuffer1: Buffer = Buffer.from(pointer1.toString(16).padStart(4, '0'), 'hex').reverse();
// const pointerBuffer2: Buffer = Buffer.from(pointer2.toString(16).padStart(4, '0'), 'hex').reverse();
// const pointerBuffer3: Buffer = Buffer.from(pointer3.toString(16).padStart(4, '0'), 'hex').reverse();
const metadataBuffer = cbor.encode(metadata);

const splitBuffer = (buffer: Buffer, chunkSize: number) => {
  let chunks = [];
  for (let i = 0; i < buffer.length; i += chunkSize) {
    const chunk = buffer.subarray(i, i + chunkSize);
    chunks.push(chunk);
  }
  return chunks;
};
const contentBufferArray: Array<Buffer> = splitBuffer(contentBufferData, 400)

export function createChildInscriptionTapScript(): Array<Buffer> {
  const keyPair = wallet.ecPair;
  let childOrdinalStacks: any = [
    toXOnly(keyPair.publicKey),
    opcodes.OP_CHECKSIG,
    opcodes.OP_FALSE,
    opcodes.OP_IF,
    Buffer.from("ord", "utf8"),
    1,
    1,
    Buffer.concat([Buffer.from(memeType, "utf8")]),
    1,
    2,
    pointerBuffer1,
    1,
    5,
    metadataBuffer,
    1,
    7,
    metaProtocol,
    opcodes.OP_0
  ];
  
  contentBufferArray.forEach((item: Buffer) => {
    childOrdinalStacks.push(item)
  });
  
  childOrdinalStacks.push(opcodes.OP_ENDIF)

  return childOrdinalStacks;
}

async function childInscribe() {
  const keyPair = wallet.ecPair;
  const childOrdinalStack = createChildInscriptionTapScript();

  const ordinal_script = script.compile(childOrdinalStack);
  const scriptTree: Taptree = {
    output: ordinal_script,
  };

  const redeem = {
    output: ordinal_script,
    redeemVersion: 192,
  };

  const ordinal_p2tr = payments.p2tr({
    internalPubkey: toXOnly(keyPair.publicKey),
    network,
    scriptTree,
    redeem,
  });

  const address = ordinal_p2tr.address ?? "";
  console.log("Send coins to address", address);

  const utxos = await waitUntilUTXO(address as string);
  
  const psbt = new Psbt({ network });
  
  const parentInscriptionUTXO = {
    txid: txhash,
    vout: 1,
    value: 546
  };

  psbt.addInput({
    hash: parentInscriptionUTXO.txid,
    index: parentInscriptionUTXO.vout,
    witnessUtxo: {
      value: parentInscriptionUTXO.value,
      script: wallet.output,
    },
    tapInternalKey: toXOnly(keyPair.publicKey),
  });
  console.log("admin wallet utxo==>",utxos[0].txid);
  
  psbt.addInput({
    hash: utxos[0].txid,
    index: utxos[0].vout,
    tapInternalKey: toXOnly(keyPair.publicKey),
    witnessUtxo: { value: utxos[0].value, script: ordinal_p2tr.output! },
    tapLeafScript: [
      {
        leafVersion: redeem.redeemVersion,
        script: redeem.output,
        controlBlock: ordinal_p2tr.witness![ordinal_p2tr.witness!.length - 1],
      },
    ],
  });

  const change = utxos[0].value - 546 * 2 - fee;

  psbt.addOutput({
    address: receiveAddress, // Destination Address
    value: 546,
  });

  psbt.addOutput({
    address: receiveAddress, // Destination Address
    value: 546,
  });

  psbt.addOutput({
    address: receiveAddress, // Change address
    value: change,
  });

  await signAndSend(keyPair, psbt);
}

// async function createMultipleInscribtions(numOfInscribtions: number) {
//   for (let i = 0; i < numOfInscribtions; i++) {
//     await childInscribe();
//   }
// }
childInscribe();
// Call the function with the desired number of inscriptions
// createMultipleInscribtions(3);

export async function signAndSend(
  keypair: BTCSigner,
  psbt: Psbt,
) {
  const signer = tweakSigner(keypair, { network })
  psbt.signInput(0, signer);
  psbt.signInput(1, keypair);
  psbt.finalizeAllInputs()
  const tx = psbt.extractTransaction();

  console.log(tx.virtualSize())
  console.log(tx.toHex());

  const txid = await broadcast(tx.toHex());
  console.log(`Success! Txid is ${txid}`);
}

export async function waitUntilUTXO(address: string) {
  return new Promise<IUTXO[]>((resolve, reject) => {
    let intervalId: any;
    const checkForUtxo = async () => {
      try {
        const response: AxiosResponse<string> = await blockstream.get(
          `/address/${address}/utxo`
        );
        const data: IUTXO[] = response.data
          ? JSON.parse(response.data)
          : undefined;
        console.log(data);
        if (data.length > 0) {
          resolve(data);
          clearInterval(intervalId);
        }
      } catch (error) {
        reject(error);
        clearInterval(intervalId);
      }
    };
    intervalId = setInterval(checkForUtxo, 4000);
  });
}

export async function getTx(id: string): Promise<string> {
  const response: AxiosResponse<string> = await blockstream.get(
    `/tx/${id}/hex`
  );
  return response.data;
}

const blockstream = new axios.Axios({
  baseURL: `https://mempool.space/testnet/api`,
});

export async function broadcast(txHex: string) {
  const response: AxiosResponse<string> = await blockstream.post("/tx", txHex);
  return response.data;
}

function tapTweakHash(pubKey: Buffer, h: Buffer | undefined): Buffer {
  return crypto.taggedHash(
    "TapTweak",
    Buffer.concat(h ? [pubKey, h] : [pubKey])
  );
}

function toXOnly(pubkey: Buffer): Buffer {
  return pubkey.subarray(1, 33);
}

function tweakSigner(signer: any, opts: any = {}) {
  let privateKey = signer.privateKey;
  if (!privateKey) {
    throw new Error('Private key is required for tweaking signer!');
  }
  if (signer.publicKey[0] === 3) {
    privateKey = ecc.privateNegate(privateKey);
  }
  const tweakedPrivateKey = ecc.privateAdd(privateKey, tapTweakHash(toXOnly(signer.publicKey), opts.tweakHash));
  if (!tweakedPrivateKey) {
    throw new Error('Invalid tweaked private key!');
  }
  return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network: opts.network,
  });
}

interface IUTXO {
  txid: string;
  vout: number;
  status: {
    confirmed: boolean;
    block_height: number;
    block_hash: string;
    block_time: number;
  };
  value: number;
}