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
  address as Address,
} from "bitcoinjs-lib";

import { Taptree } from "bitcoinjs-lib/src/types";
import { ECPairFactory, ECPairAPI } from "ecpair";
import ecc from "@bitcoinerlab/secp256k1";
import axios, { AxiosResponse } from "axios";
import networkConfig from "config/network.config";
import { WIFWallet } from 'utils/WIFWallet'
import { SeedWallet } from "utils/SeedWallet";
import cbor from 'cbor'
//test
// const network = networks.testnet;
const network = networks.bitcoin;

initEccLib(ecc as any);
const ECPair: ECPairAPI = ECPairFactory(ecc);

const seed: string = process.env.MNEMONIC as string;
const networkType: string = networkConfig.networkType;
const wallet = new SeedWallet({ networkType: networkType, seed: seed });

// const privateKey: string = process.env.PRIVATE_KEY as string;
// const networkType: string = networkConfig.networkType;
// const wallet = new WIFWallet({ networkType: networkType, privateKey: privateKey });

const txhash: string = 'da40a9da1d0b95609cfcefecdc47cb20a92b5f4e4c672ded5488463182762405'
const txidBuffer = Buffer.from(txhash, 'hex');
console.log("txidBuffer==>", txidBuffer);

const delegateBuffer = txidBuffer.reverse();
console.log("delegateBufer===>", delegateBuffer);
const delegatedBuffer = cbor.encode(delegateBuffer)
console.log("delegatedBuffer<========>", delegatedBuffer);

const receiveAddress: string = "bc1pwc08hjtg4nkaj390u7djryft2z3l4lea4zvepqnpj2adsr4ujzcsxm5hmh";
const transaction_fee = 8000;

export async function createdelegateInscriptionTapScript(): Promise<Buffer[]> {

  const keyPair = wallet.ecPair;
  const delegateOrdinalStacks: any = [
    toXOnly(keyPair.publicKey),
    opcodes.OP_CHECKSIG,
    opcodes.OP_FALSE,
    opcodes.OP_IF,
    Buffer.from("ord", "utf8"),
    1,
    11,
    delegatedBuffer,
    opcodes.OP_ENDIF,
  ];

  return delegateOrdinalStacks;
}

async function delegateInscribe() {
  const keyPair = wallet.ecPair;
  console.log("delegateBuffer===>", delegateBuffer);

  const delegateOrdinalStack = await createdelegateInscriptionTapScript();

  const ordinal_script = script.compile(delegateOrdinalStack);
  console.log("ordinal_script====>", ordinal_script);

  const scriptTree: Taptree = {
    output: ordinal_script,
  };
  console.log("scriptTree===>", scriptTree);

  const redeem = {
    output: ordinal_script,
    redeemVersion: 192,
  };
  console.log("redee===>", redeem);

  const ordinal_p2tr = payments.p2tr({
    internalPubkey: toXOnly(keyPair.publicKey),
    network,
    scriptTree,
    redeem,
  });
  console.log("ordinal_p2tr===>", ordinal_p2tr);

  const address = ordinal_p2tr.address ?? "";
  console.log("send coin to address", address);

  const utxos = await waitUntilUTXO(address as string);
  console.log(`Using UTXO ${utxos[0].txid}:${utxos[0].vout}`);
  console.log("utxo value", utxos[0].value);

  const psbt = new Psbt({ network });

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

  console.log("pasbt addInput==>", psbt);

  const change = utxos[0].value - 546 - transaction_fee;

  psbt.addOutput({
    address: receiveAddress, //Destination Address
    value: 546,
  });
  console.log("ordinal psbt==>", psbt);

  psbt.addOutput({
    address: receiveAddress, // Change address
    value: change,
  });
  console.log("change psbt==>", psbt);
  await signAndSend(keyPair, psbt);
}

delegateInscribe().catch(err => console.error(err))

export async function signAndSend(
  keypair: BTCSigner,
  psbt: Psbt,
) {
  psbt.signInput(0, keypair);
  psbt.finalizeAllInputs()
  const tx = psbt.extractTransaction();

  console.log(tx.virtualSize())
  console.log(tx.toHex())

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
    intervalId = setInterval(checkForUtxo, 10000);
  });
}
// export async function getTx(id: string): Promise<string> {
//   const response: AxiosResponse<string> = await blockstream.get(
//     `/tx/${id}/hex`
//   );
//   return response.data;
// }
const blockstream = new axios.Axios({
  baseURL: `https://mempool.space/api`,
  // baseURL: `https://mempool.space/testnet/api`,
});
export async function broadcast(txHex: string) {
  const response: AxiosResponse<string> = await blockstream.post("/tx", txHex);
  return response.data;
}

// function tapTweakHash(pubKey: Buffer, h: Buffer | undefined): Buffer {
//   return crypto.taggedHash(
//     "TapTweak",
//     Buffer.concat(h ? [pubKey, h] : [pubKey])
//   );
// }

function toXOnly(pubkey: Buffer): Buffer {
  return pubkey.subarray(1, 33);
}
// function tweakSigner(signer: any, opts: any = {}) {
//   let privateKey = signer.privateKey;
//   if (!privateKey) {
//     throw new Error('Private key is required for tweaking signer!');
//   }
//   if (signer.publicKey[0] === 3) {
//     privateKey = ecc.privateNegate(privateKey);
//   }
//   const tweakedPrivateKey = ecc.privateAdd(privateKey, tapTweakHash(toXOnly(signer.publicKey), opts.tweakHash));
//   if (!tweakedPrivateKey) {
//     throw new Error('Invalid tweaked private key!');
//   }
//   return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
//     network: opts.network,
//   });
// }
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