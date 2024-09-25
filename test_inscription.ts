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
import ecc from "@bitcoinerlab/secp256k1";
import axios, { AxiosResponse } from "axios";
import networkConfig from "config/network.config";
import { WIFWallet } from 'utils/WIFWallet'
import cbor from 'cbor'

const network = networks.testnet;

initEccLib(ecc as any);


const privateKey: string = process.env.PRIVATE_KEY as string;
const networkType: string = networkConfig.networkType;
const wallet = new WIFWallet({ networkType: networkType, privateKey: privateKey });

const receiveAddress: string = "tb1pwc08hjtg4nkaj390u7djryft2z3l4lea4zvepqnpj2adsr4ujzcs3nzcpc";
const metadata = {
    'type': 'Bitmap',
    'description': 'Bitmap Community Parent Ordinal'
}
const metadataBuffer = cbor.encode(metadata);
const transaction_fee = 10000;


// Now pointerBuffer is an array of buffers
// console.log("pointerBuffer==>",pointerBuffer);


export const contentBuffer = (content: string) => {
    return Buffer.from(content, 'utf8')
}
const contentBufferData: Buffer = contentBuffer(`<!DOCTYPE html>
<html>
   <body style="margin: 0;padding: 0">
      <script>
function draw(t, e, colors) {
    let n = t.getContext("2d"), o = [];
    var a = 0;
    e.forEach((imgSrc, index) => {
        let l = new Image;
        l.src = imgSrc;
        l.onload = () => {
            (a += 1) === e.length && function drawImages() {
                for (let i = 0; i < o.length; i++) {
                    n.drawImage(o[i], 0, 0);
                    n.fillStyle = colors[i];
                    n.globalCompositeOperation = 'source-atop'; 
                    n.fillRect(0, 0, o[i].width, o[i].height); 
                    n.globalCompositeOperation = 'destination-over'; 
                }
            }();
        };
        o.push(l);
    });
}
      </script>
      <canvas id="canvas" style="width: 100%; height: auto;" width="2500" height="2500"></canvas>
      <script>
        const imageSources = [ 
          "/content/e8ef7b28630fed165dad3acda08db5f089dfcf1bd005086abbf4c078958ccfb4i0",
          "/content/87f9c8d7b99734816346cbe942ca6709e64a49278026b1e1345bf751468ae267i0",
          "/content/0f27fcbaf43f17a39320af2d0cfc85fc4293d300f5bf932c1eb96b942f7a022ci0",
          "/content/cb692d0b3c306ee0d129b0903106571b6e98c17d5c75e266c0207d103b042be5i0"
        ];
        const colors = ['rgba(255, 0, 0, 0.5)', 'rgba(0, 255, 0, 0.5)', 'rgba(0, 0, 255, 0.5)', 'rgba(255, 255, 0, 0.5)'];
        draw(document.getElementById('canvas'), imageSources, colors);
      </script>
   </body>
</html>
    `);
const contentBuffer1 = cbor.encode(contentBufferData)
export function createparentInscriptionTapScript(): Array<Buffer> {

    const keyPair = wallet.ecPair;
    let parentOrdinalStacks: any = [
        toXOnly(keyPair.publicKey),
        opcodes.OP_CHECKSIG,
        opcodes.OP_FALSE,
        opcodes.OP_IF,
        Buffer.from("ord", "utf8"),
        1,
        1,
        Buffer.concat([Buffer.from("text/html;charset=utf-8", "utf8")]),
        1,
        3,
        contentBuffer1,
        1,
        5,
        metadataBuffer,
        1,
        7,
        Buffer.concat([Buffer.from("chubby.cheek", "utf8")]),
        opcodes.OP_0,
        opcodes.OP_ENDIF
    ];

    // console.log("parentOrdinalStacks==>",parentOrdinalStacks);

    return parentOrdinalStacks;
}

async function parentInscribe() {
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
    console.log("send coin to address", address);

    const utxos = await waitUntilUTXO(address as string);
    console.log(`Using UTXO ${utxos[0].txid}:${utxos[0].vout}`);

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


    const change = utxos[0].value - 546 - transaction_fee;

    psbt.addOutput({
        address: receiveAddress, //Destination Address
        value: 546,
    });

    psbt.addOutput({
        address: receiveAddress, // Change address
        value: change,
    });

    await signAndSend(keyPair, psbt);
}

parentInscribe()

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
    // baseURL: `https://mempool.space/api`,
});
export async function broadcast(txHex: string) {
    const response: AxiosResponse<string> = await blockstream.post("/tx", txHex);
    return response.data;
}

function toXOnly(pubkey: Buffer): Buffer {
    return pubkey.subarray(1, 33);
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