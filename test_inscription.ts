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
const transaction_fee = 180000;


// Now pointerBuffer is an array of buffers
// console.log("pointerBuffer==>",pointerBuffer);


export const contentBuffer = (content: string) => {
    return Buffer.from(content, 'utf8')
}
const contentBufferData: Buffer = contentBuffer(`
    <!DOCTYPE html>
<html lang="en"> 
<body>
    <canvas id="canvas" style="width:100%; height:100%" width="2500" height="2500"></canvas>
    <script>
        async function draw(canvas, links) {
            const ctx = canvas.getContext("2d");
            const colors = generateRandomColors(links.length); // Generate random colors
            let images = [];
            let loadedCount = 0;

            links.forEach(async (link, index) => {
                const color = colors[index]; // Get the randomly generated color
                const svgString = await fetchSVG(link);
                const coloredSVG = setSVGColor(svgString, color);
                const img = await createImageFromSVG(coloredSVG);
                
                images.push(img);
                if (++loadedCount === links.length) {
                    renderCanvas(images, ctx);
                }
            });
        }

        async function fetchSVG(link) {
            const response = await fetch(link);
            if (!response.ok) throw new Error('Network response was not OK.');
            return await response.text();
        }

        function setSVGColor(svgString, color) {
            return svgString.replace(/fill="([^"]*)"/g, `/fill="${color}"/`);
        }

        function createImageFromSVG(svgString) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(svgBlob);

                img.onload = () => {
                    URL.revokeObjectURL(url); // Free up the blob URL after use
                    resolve(img);
                };

                img.onerror = (e) => {
                    URL.revokeObjectURL(url);
                    reject(new Error('Failed to load SVG image.'));
                };

                img.src = url; // Set the image source to the blob URL
            });
        }

        function renderCanvas(images, ctx) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); // Clear the canvas before redrawing
            for (let i = 0; i < images.length; i++) {
                ctx.drawImage(images[i], 0, 0, 2500, 2500); // Each SVG is drawn in separate rows with some vertical spacing
            }
        }

        function generateRandomColors(count) {
            const colors = [];
            for (let i = 0; i < count; i++) {
                colors.push('#' + Math.floor(Math.random()*16777215).toString(16)); // Generates a random hex color
            }
            return colors;
        }

        const links = [
            "/content/f9ef5ababf468c72f5340570ee424d6f5d79001a34c71b15ba9c4efc1fb8a11bi0",
            "/content/45797cf05aa1fd39d0abe0c6ab2c035045f7587d7db8c719aa226c4e72bcc6cdi0",
            "/content/30ac400b66e04bf6a2be0fb5c48f0a1f441c560479be860a444c6c8fb4d7797di0",
            "/content/71c22f5871c16c16452a3b434d206f0a492f26a123247452f0627bd2707d9ac9i0"
        ];

        // Initial drawing on load
        draw(document.getElementById('canvas'), links);
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