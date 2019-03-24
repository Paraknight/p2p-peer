import EventEmitter from './event-emitter.js';

class Peer extends EventEmitter {
  constructor(uid, network) {
    super();
    this.uid = uid;
    this.network = network;
    this.rooms = [];
    this.conn = new RTCPeerConnection();

    this.conn.onicecandidate = event => event.candidate && this.network.signal('ice', {
      to: this.uid,
      candidate: event.candidate
    });

    this.conn.ondatachannel = event => this.ondatachannel(event.channel);
  }

  createOffer() {
    this.conn.createOffer().then(offer => this.conn.setLocalDescription(offer)).then(() => this.network.signal('sdp', {
      to: this.uid,
      sdp: this.conn.localDescription
    })).catch(error => console.error('Error creating connection offer:', error));
  }

  createAnswer(sdp) {
    this.conn.createAnswer().then(answer => this.conn.setLocalDescription(answer)).then(() => this.network.signal('sdp', {
      to: this.uid,
      sdp: this.conn.localDescription
    })).catch(error => console.error('Error creating connection answer:', error));
  } // TODO: Support reliable and unreliable


  createDataChannel(label) {
    this.dataChannel = this.conn.createDataChannel(label);
    this.ondatachannel(this.dataChannel);
  }

  ondatachannel(channel) {
    this.dataChannel = channel;

    channel.onerror = error => console.error('Peer', this.uid, 'DataChannel error:', error);

    channel.onopen = () => this.emit('datachannelopen', this);

    channel.onclose = () => this.emit('datachannelclose', this);

    channel.onmessage = event => this.onmessage(event.data);
  }

  onmessage(message) {
    try {
      message = JSON.parse(message);
    } catch (e) {
      console.error('Invalid data received from', this.uid, ':', message, e);
      return;
    }

    this.emit('message', message); // TODO: Validate this too

    this.emit(message.event, message.data);
  }

  send(event, data) {
    if (this.dataChannel == null || this.dataChannel.readyState !== 'open') return;
    this.dataChannel.send(JSON.stringify({
      event,
      data
    }));
  }

  disconnect() {
    if (!(this.uid in this.network.peers)) return;
    this.rooms = [];
    delete this.network.peers[this.uid];
    if (this.dataChannel != null) this.dataChannel.close();
    if (this.conn.signalingState !== 'closed') this.conn.close(); // TODO: Reconnect if wrongful DC

    this.emit('disconnect');
  }

}

export default class PeerNetwork extends EventEmitter {
  constructor() {
    super();
    this.ownUID = null;
    this.peers = {};
  }

  signal(event, ...args) {
    this.sigServ.emit(event, ...args);
    return this;
  }

  join(roomID) {
    console.log('Joining room', roomID);
    this.sigServ.emit('join', {
      rid: roomID
    });
    return this;
  }

  leave(roomID) {
    console.log('Leaving room', roomID);
    this.sigServ.emit('leave', {
      rid: roomID
    });
    return this;
  }

  broadcast(event, data) {
    for (let uid in this.peers) this.peers[uid].send(event, data);
  }

  async connect(sigServURL) {
    sigServURL = new URL(sigServURL); // TODO: Catch error

    await new Promise((resolve, reject) => {
      let script = document.createElement('script');
      script.type = 'text/javascript';
      sigServURL.pathname = '/socket.io/socket.io.js';
      script.src = sigServURL.href;
      script.addEventListener('load', resolve, false);
      script.addEventListener('error', reject, false);
      document.body.appendChild(script);
    });
    this.sigServ = io(sigServURL.origin);
    this.sigServ.on('connect', () => {//console.log('Peer connected to signalling server');
    });
    this.sigServ.on('disconnect', () => {//console.log('Peer disconnected from signalling server');
    });
    this.sigServ.on('uid', uid => {
      //console.log('Peer UID is', uid);
      this.ownUID = uid;
      this.emit('uid', uid);
    });
    this.sigServ.on('join', data => {
      //console.log('A peer with UID', data.uid, 'just joined the room', data.rid);
      if (!(data.uid in this.peers)) {
        let peer = new Peer(data.uid, this);
        peer.rooms.push(data.rid);
        peer.on('datachannelopen', peer => this.emit('connection', peer));
        peer.on('datachannelclose', peer => peer.disconnect());
        peer.on('disconnect', () => this.emit('disconnection', peer));
        this.peers[data.uid] = peer;
      }

      this.sigServ.emit('hail', {
        to: data.uid,
        rid: data.rid
      });
    });
    this.sigServ.on('hail', data => {
      //console.log('A peer with UID', data.from, 'just hailed from', data.rid);
      if (data.from in this.peers) {
        this.peers[data.from].rooms.push(data.rid);
        return;
      }

      let peer = new Peer(data.from, this);
      peer.rooms.push(data.rid);
      peer.on('datachannelopen', peer => this.emit('connection', peer));
      peer.on('datachannelclose', peer => peer.disconnect());
      peer.on('disconnect', () => this.emit('disconnection', peer));
      peer.createDataChannel(this.ownUID + '_' + data.from);
      peer.createOffer();
      this.peers[data.from] = peer;
    });
    this.sigServ.on('sdp', data => {
      let sdp = data.sdp; //console.log('SDP', sdp.type, 'received from peer with UID', data.from);

      if (this.peers[data.from] == null) return;
      this.peers[data.from].conn.setRemoteDescription(new RTCSessionDescription(sdp));
      if (sdp.type === 'offer') this.peers[data.from].createAnswer(sdp);
    });
    this.sigServ.on('ice', data => {
      //console.log('ICE data received from peer with UID', data.from);
      if (this.peers[data.from] == null) return;
      this.peers[data.from].conn.addIceCandidate(new RTCIceCandidate(data.candidate));
    });
    this.sigServ.on('leave', data => {
      if (!(data.uid in this.peers)) return;
      let peer = this.peers[data.uid];

      if (data.rid == null) {
        //console.log('A peer with UID', data.uid, 'just left all rooms');
        peer.disconnect();
        return;
      }

      if (!(data.rid in peer.rooms)) return; //console.log('A peer with UID', data.uid, 'just left the room', data.rid);

      peer.rooms.splice(peer.rooms.indexOf(data.rid), 1);
      if (peer.rooms.length > 0) return;
      peer.disconnect();
    });
    return this;
  }

}