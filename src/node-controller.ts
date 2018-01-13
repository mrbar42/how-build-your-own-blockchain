import {deserialize, serialize} from "serializer.ts/Serializer";
import {EventEmitter} from 'Eventemitter3';
import {Blockchain, MiningHandle} from './blockchain';
import {Block} from './block';
import {Transaction} from './transaction';
import {Peer} from './Peer';
import { Crypto, IKeys } from './crypto';

export class NodeController extends EventEmitter {
  private blockchain: Blockchain;
  private keys: IKeys;
  private peers: { [peerId: string]: Peer };
  private miningHandle: MiningHandle;
  private runningConsensus: Promise<void>;
  private config: {
    autoMining: boolean,
    autoConsensus: boolean
  };

  constructor(peers: { [peerId: string]: Peer }) {
    super();
    this.peers = peers;
    this.miningHandle = null;
    this.runningConsensus = Promise.resolve();
  }

  private startMining({internal} = {internal: false}) {
    if (internal && !this.config.autoMining) return;

    if (this.miningHandle) {
      const isTheSameTransactionsCount = this.miningHandle.transactionsCount === this.blockchain.transactionPool.length + 1;
      const didChainChange = this.miningHandle.lastBlock !== this.blockchain.getLastBlock().blockNumber;
      if (isTheSameTransactionsCount && !didChainChange) {
        // there hasn't been any change to the transactions - ignore call
        return;
      }
      else if (this.miningHandle.transactionsCount < Blockchain.MAX_BLOCK_SIZE) {
        // there is room for more transactions in the currently mined block - restart mining
        this.miningHandle.stop();
        this.miningHandle = null;
      }
      else if (!didChainChange) {
        // there is no more room for transactions in the currently mined block - exit
        return;
      }
      else {
        // chain changed - restart mining
        this.miningHandle.stop();
        this.miningHandle = null;
      }
    }

    this.miningHandle = this.blockchain.mineBlock();
    this.miningHandle.newBlockPromise
      .then(
        () => {
          // notify everyone about the new block
          this.miningHandle = null;
          this.notifyAll('/new-block');
          this.startMining({internal: true});
        },
        err => {
          console.error('mining error', err);
          this.miningHandle = null;
          this.startMining({internal: true});
        });

    this.emit('liveState', {
      isMining: true
    });
  }

  stopMining() {
    if (this.miningHandle) {
      this.miningHandle.stop();
      this.miningHandle = null;
    }
    this.emit('liveState', {
      isMining: false
    });
  }

  private notifyAll(route: string, payload: any = null) {
    this.emit('activity', {msg: `Notifying all peers ${route}`});
    Promise.all(
      Object.values(this.peers)
        .map(node => node.fetch(route, payload, 'post'))
    )
      .catch(err => {
        console.log('Some notifications failed', err);
      });
  };

  public async init({miningAddress = '', autoMining = true, autoConsensus = true} = {miningAddress: ''}) {
    if (!miningAddress) throw new Error('Must provide mining address');

    this.keys = await Crypto.generateKeys();
    this.config = {autoMining, autoConsensus};
    this.blockchain = new Blockchain(miningAddress);

    this.startMining({internal: true});
    this.consensus({internal: true})
      .catch(err => {
        console.error('Initial consensus failed', err);
      });
  }

  public async consensus({internal} = {internal: false}) {
    if (internal && !this.config.autoConsensus) return;

    if (!Object.keys(this.peers).length || !this.blockchain) return;

    const blockchainsResults = await Promise.all(Object.values(this.peers).map(node => node.fetch('/blocks')));

    const blockchains = blockchainsResults.map(({data}) => deserialize<Block[]>(Block, data));
    const success = this.blockchain.consensus(blockchains);

    if (success) {
      console.log(`Reached consensus from ${blockchainsResults.length} nodes`);
      this.emit('activity', {msg: `Reached consensus from ${blockchainsResults.length} nodes`});
    }
    else {
      console.log(`Can't reach a consensus ${blockchainsResults.length}`);
      this.emit('activity', {msg: `Can't reach a consensus ${blockchainsResults.length}`});
    }

    this.startMining({internal: true});
  }

  public getAllBlocks() {
    if (!this.blockchain) return [];
    return this.blockchain.blocks;
  }

  public getBlock(blockId: string) {
    const id = Number(blockId);
    if (isNaN(id)) throw new Error('Invalid Block Id');

    if (!this.blockchain || id >= this.blockchain.blocks.length) throw new Error(`Block #${id} wasn't found`);

    return this.blockchain.blocks[id];
  }

  public getTransactions(): Array<Transaction> {
    if (!this.blockchain) return [];
    return this.blockchain.transactionPool.slice();
  }

  public async submitTransaction(transaction: Transaction){
    await this.blockchain.submitTransaction(transaction);
    this.emit('activity', {msg: `Transaction submitted ${serialize(transaction)}`});
    this.startMining({internal: true});
  }

  public async createTransaction(senderAddress: string, recipientAddress: string, value: number, timestamp: number, signature: string) {
    if (!this.blockchain) throw new Error('Block chain is not initialized');
    if (!senderAddress || !recipientAddress || !value) throw new Error("Invalid parameters!");
    const transaction = new Transaction(senderAddress, recipientAddress, value, timestamp, signature);
    await this.submitTransaction(transaction);

    this.notifyAll('/transactions', serialize(transaction));
  }

  public handleNewBlockNotifications() {
    // chain consensus calls so we don't miss any but still only run one in parallel
    this.runningConsensus = this.runningConsensus.then(async () => {
      try {
        await this.consensus({internal: true});
        this.startMining({internal: true});
      }
      catch (err) {
        console.warn('Consensus failed', err);
      }
    })
  }
}
