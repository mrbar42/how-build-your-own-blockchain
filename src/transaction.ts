export class Transaction {
  public readonly senderAddress: string;
  public readonly recipientAddress: string;
  public readonly value: number;
  public readonly timestamp: number;
  public readonly signature: string;

  constructor(senderAddress: string, recipientAddress: string, value: number, timestamp: number, signature: string) {
    this.senderAddress = senderAddress;
    this.recipientAddress = recipientAddress;
    this.value = value;
    this.timestamp = timestamp;
    this.signature = signature;
  }
}
