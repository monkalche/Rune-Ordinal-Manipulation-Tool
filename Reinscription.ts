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
import { SeedWallet } from "utils/SeedWallet";
import cbor from 'cbor'
const network = networks.testnet;

initEccLib(ecc as any);
const ECPair: ECPairAPI = ECPairFactory(ecc);


const privateKey: string = process.env.PRIVATE_KEY as string;
const networkType: string = networkConfig.networkType;
const wallet = new WIFWallet({ networkType: networkType, privateKey: privateKey });

const receiveAddress: string = "tb1pwc08hjtg4nkaj390u7djryft2z3l4lea4zvepqnpj2adsr4ujzcs3nzcpc";
const metadata = {
  'type': 'Bitmap',
  'description': 'Bitmap Community Parent Ordinal'
}
const metadataBuffer = cbor.encode(metadata);

export function createparentInscriptionTapScript(): Array<Buffer> {

  const keyPair = wallet.ecPair;
  const parentOrdinalStacks: any = [
    toXOnly(keyPair.publicKey),
    opcodes.OP_CHECKSIG,
    opcodes.OP_FALSE,
    opcodes.OP_IF,
    Buffer.from("ord", "utf8"),
    1,
    1,
    Buffer.concat([Buffer.from("text/plain;charset=utf-8", "utf8")]),
    1,
    5,
    metadataBuffer,
    opcodes.OP_0,
    Buffer.concat([Buffer.from("reinscription.bitmap", "utf8")]),
    opcodes.OP_ENDIF,
  ];
  return parentOrdinalStacks;
}

async function reInscribe() {
  const keyPair = wallet.ecPair;
  const parentOrdinalStack = createparentInscriptionTapScript();

  const ordinal_script = script.compile(parentOrdinalStack);

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
  console.log("Sending coin to address", address);

  const SendOrdinalsPsbt = new Psbt({ network });

  const sendOrdinalPsbtFee = 30000;
  // reinscriptionUtxo()
  const SendUtxos: Array<any> = [
    {
      txid: 'abe0069b68a24dd5d95b5ad090c69448144fff99ecc4ae5c5063aec141b19e5c',
      vout: 1,
      value: 159454
    },
    {
      txid: '00051976f7edc59f03f5364847b899944d3e33e52714e6a69657b0ff03512b58',
      vout: 1,
      value: 249454
    }
  ]

  SendOrdinalsPsbt.addInput({
    hash: SendUtxos[0].txid,
    index: SendUtxos[0].vout,
    witnessUtxo: {
      value: SendUtxos[0].value,
      script: wallet.output,
    },
    tapInternalKey: toXOnly(keyPair.publicKey),
  });

  SendOrdinalsPsbt.addInput({
    hash: SendUtxos[1].txid,
    index: SendUtxos[1].vout,
    witnessUtxo: {
      value: SendUtxos[1].value,
      script: wallet.output,
    },
    tapInternalKey: toXOnly(keyPair.publicKey),
  });

  SendOrdinalsPsbt.addOutput({
    address: address, //Destination Address
    value: 220000,
  });

  // await SendUtxoSignAndSend(keyPair, SendOrdinalsPsbt);

  // const utxos = await waitUntilUTXO(address as string);
  
  /**
   * 
   * 
   */
  const tempUtxo = {
    txid: 'cf2abf2f9e1a35a4f3318d2b6088cc7b98d71547977d8651de695185bff4e8f1',
    vout: 0,
    value: 220000
  };

  const psbt = new Psbt({ network });

  /** */
  const transaction_fee = 30000;

  psbt.addInput({
    hash: tempUtxo.txid,
    index: tempUtxo.vout,
    tapInternalKey: toXOnly(keyPair.publicKey),
    witnessUtxo: { value: tempUtxo.value, script: ordinal_p2tr.output! },
    tapLeafScript: [
      {
        leafVersion: redeem.redeemVersion,
        script: redeem.output,
        controlBlock: ordinal_p2tr.witness![ordinal_p2tr.witness!.length - 1],
      },
    ],
  });

  psbt.addOutput({
    address: receiveAddress, //Destination Address
    value: 546,
  });



  await signAndSend(keyPair, psbt);
}

reInscribe()

export async function signAndSend(
  keypair: BTCSigner,
  psbt: Psbt,
) {
  psbt.signInput(0, keypair);
  psbt.finalizeAllInputs()
  const tx = psbt.extractTransaction();

  console.log(tx.virtualSize())
  console.log(tx.toHex())

 
}


export async function SendUtxoSignAndSend(
  keypair: BTCSigner,
  psbt: Psbt,
) {
  const signer = tweakSigner(keypair, { network })
  psbt.signInput(0, signer);
  psbt.signInput(1, signer);
  psbt.finalizeAllInputs()
  const tx = psbt.extractTransaction();

  console.log(tx.virtualSize())
  console.log(tx.toHex())
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


export async function reinscriptionUtxo() {

  const response = await fetch('https://open-api-testnet.unisat.io/v1/indexer/tb1pwc08hjtg4nkaj390u7djryft2z3l4lea4zvepqnpj2adsr4ujzcs3nzcpc/inscription-utxo-data', {
    method: 'GET',
    headers: { Authorization: `Bearer ${process.env.API_KEY as string}` },
  });
  const data = await response.json();
  console.log("ustx===>", data);

}
export async function getTx(id: string): Promise<string> {
  const response: AxiosResponse<string> = await blockstream.get(
    `/tx/${id}/hex`
  );
  return response.data;
}
const blockstream = new axios.Axios({
  baseURL: `https://mempool.space/testnet/api`,
  // baseURL: `https://mempool.space/api`,
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