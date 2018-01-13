const str2ab = (str: string): ArrayBuffer => {
  const array = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    array[i] = str.charCodeAt(i);
  }
  return <ArrayBuffer>array.buffer;
};

const ab2str = (buffer: ArrayBuffer) => {
  return String.fromCharCode.apply(null, new Uint8Array(buffer));
};

export interface IKeys {
  privateKey: string;
  publicKey: string
}

export class Crypto {
  public static async generateKeys(): Promise<IKeys> {
    const cryptoKey = await
      window.crypto.subtle.generateKey(
        {
          name: "RSASSA-PKCS1-v1_5",
          modulusLength: 2048,
          publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
          hash: { name: "SHA-256" },
        },
        true,
        ["sign", "verify"]
      );

    const privateKey = await
      window.crypto.subtle.exportKey('jwk', cryptoKey.privateKey);
    const publicKey = await
      window.crypto.subtle.exportKey('jwk', cryptoKey.publicKey);

    return {
      privateKey: JSON.stringify(privateKey),
      publicKey: JSON.stringify(publicKey)
    };
  }

  public static async sign(data: string, privateKey: string): Promise<string> {
    const dataBuffer = str2ab(data);

    const key = await window.crypto.subtle.importKey(
      'jwk',
      JSON.parse(privateKey),
      {   //these are the algorithm options
        name: "RSASSA-PKCS1-v1_5",
        hash: { name: "SHA-256" }, //can be "SHA-1", "SHA-256", "SHA-384", or "SHA-512"
      },
      false, //whether the key is extractable (i.e. can be used in exportKey)
      ["sign"]
    );

    const signature = await window.crypto.subtle.sign(
      <any>{
        name: "RSASSA-PKCS1-v1_5",
      },
      key,
      dataBuffer
    );

    return ab2str(signature);
  }

  public static async verify(data: string, publicKey: string, signature: string): Promise<boolean> {
    const dataBuffer = str2ab(data);
    const signatureBuffer = str2ab(signature);

    const key = await window.crypto.subtle.importKey(
      'jwk',
      JSON.parse(publicKey),
      {   //these are the algorithm options
        name: "RSASSA-PKCS1-v1_5",
        hash: { name: "SHA-256" }, //can be "SHA-1", "SHA-256", "SHA-384", or "SHA-512"
      },
      false, //whether the key is extractable (i.e. can be used in exportKey)
      ["verify"]
    );

    return await window.crypto.subtle.verify(
      <any>{
        name: "RSASSA-PKCS1-v1_5",
      },
      key,
      signatureBuffer,
      dataBuffer
    );
  }
}
