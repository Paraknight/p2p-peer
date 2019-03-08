var iceServers, EventEmitter, webrtcAdapterTest, io, PeerNetwork, Peer, out$ = typeof exports != 'undefined' && exports || this;
iceServers = [
	{
		url: 'stun:stun.l.google.com:19302'
	}, {
		url: 'stun:stun1.l.google.com:19302'
	}, {
		url: 'stun:stun2.l.google.com:19302'
	}, {
		url: 'stun:stun3.l.google.com:19302'
	}, {
		url: 'stun:stun4.l.google.com:19302'
	}, {
		url: 'stun:stun.services.mozilla.com'
	}, {
		url: 'stun:23.21.150.121'
	}, {
		url: 'stun:stun.anyfirewall.com:3478'
	}, {
		url: 'stun:stun01.sipphone.com'
	}, {
		url: 'stun:stun.ekiga.net'
	}, {
		url: 'stun:stun.fwdnet.net'
	}, {
		url: 'stun:stun.ideasip.com'
	}, {
		url: 'stun:stun.iptel.org'
	}, {
		url: 'stun:stun.rixtelecom.se'
	}, {
		url: 'stun:stun.schlund.de'
	}, {
		url: 'stun:stunserver.org'
	}, {
		url: 'stun:stun.softjoys.com'
	}, {
		url: 'stun:stun.voiparound.com'
	}, {
		url: 'stun:stun.voipbuster.com'
	}, {
		url: 'stun:stun.voipstunt.com'
	}, {
		url: 'stun:stun.voxgratia.org'
	}, {
		url: 'stun:stun.xten.com'
	}, {
		url: 'turn:turn.bistri.com:80',
		credential: 'homeo',
		username: 'homeo'
	}, {
		url: 'turn:turn.anyfirewall.com:443?transport=tcp',
		credential: 'webrtc',
		username: 'webrtc'
	}, {
		url: 'turn:numb.viagenie.ca',
		credential: 'muazkh',
		username: 'webrtc@live.com'
	}, {
		url: 'turn:192.158.29.39:3478?transport=udp',
		credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
		username: '28224511:1379330808'
	}, {
		url: 'turn:192.158.29.39:3478?transport=tcp',
		credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
		username: '28224511:1379330808'
	}
];
EventEmitter = require('events');
webrtcAdapterTest = require('webrtc-adapter-test');
io = require('socket.io-client');
out$.PeerNetwork = PeerNetwork = (function(superclass){
	var prototype = extend$((import$(PeerNetwork, superclass).displayName = 'PeerNetwork', PeerNetwork), superclass).prototype, constructor = PeerNetwork;
	function PeerNetwork(sigServUrl){
		var self, x$;
		this.ownUid = null;
		this.peers = {};
		self = this;
		x$ = this.sigServ = io(sigServUrl);
		x$.on('connect', function(){});
		x$.on('uid', function(uid){
			self.ownUid = uid;
			self.emit('uid', uid);
		});
		x$.on('join', function(data){
			var x$;
			if (!(data.uid in self.peers)) {
				x$ = self.peers[data.uid] = new Peer(data.uid, self);
				x$.rooms.push(data.rid);
				x$.on('datachannelopen', function(it){
					self.emit('connection', it);
				});
				x$.on('datachannelclose', function(it){
					it.disconnect();
				});
			}
			this.emit('hail', {
				to: data.uid,
				rid: data.rid
			});
		});
		x$.on('hail', function(data){
			var x$;
			if (!(data.from in self.peers)) {
				x$ = self.peers[data.from] = new Peer(data.from, self);
				x$.rooms.push(data.rid);
				x$.on('datachannelopen', function(it){
					self.emit('connection', it);
				});
				x$.on('datachannelclose', function(it){
					it.disconnect();
				});
				x$.createDataChannel(self.ownUid + "_" + data.from);
				x$.createOffer();
			} else {
				self.peers[data.from].rooms.push(data.rid);
			}
		});
		x$.on('sdp', function(data){
			var sdp, ref$, ref1$;
			sdp = data.sdp;
			if ((ref$ = self.peers[data.from]) != null) {
				ref$.conn.setRemoteDescription(new RTCSessionDescription(sdp));
			}
			if (sdp.type === 'offer') {
				if ((ref1$ = self.peers[data.from]) != null) {
					ref1$.createAnswer(sdp);
				}
			}
		});
		x$.on('ice', function(data){
			var ref$;
			if ((ref$ = self.peers[data.from]) != null) {
				ref$.conn.addIceCandidate(new RTCIceCandidate(data.candidate));
			}
		});
		x$.on('leave', function(data){
			var peer;
			if (!(data.uid in self.peers)) {
				return;
			}
			peer = self.peers[data.uid];
			if (data.rid == null) {
				peer.disconnect();
				return;
			}
			if (!(data.rid in peer.rooms)) {
				return;
			}
			peer.rooms.splice(peer.rooms.indexOf(
				data.rid), 1);
			if (!(peer.rooms.length < 1)) {
				return;
			}
			peer.disconnect();
		});
		x$.on('disconnect', function(){});
	}
	prototype.signal = function(event, data){
		this.sigServ.emit(event, data);
	};
	prototype.join = function(roomId){
		this.sigServ.emit('join', {
			rid: roomId
		});
	};
	prototype.leave = function(roomId){
		this.sigServ.emit('leave', {
			rid: roomId
		});
	};
	return PeerNetwork;
}(EventEmitter));
Peer = (function(superclass){
	var prototype = extend$((import$(Peer, superclass).displayName = 'Peer', Peer), superclass).prototype, constructor = Peer;
	function Peer(uid, network){
		var self, x$;
		this.uid = uid;
		this.network = network;
		this.rooms = [];
		self = this;
		x$ = this.conn = new RTCPeerConnection({
			iceServers: iceServers
		});
		x$.onicecandidate = function(event){
			if (event.candidate != null) {
				self.network.signal('ice', {
					candidate: event.candidate,
					to: self.uid
				});
			}
		};
		x$.ondatachannel = function(event){
			self.ondatachannel(event.channel);
		};
	}
	prototype.createOffer = function(){
		var self;
		self = this;
		this.conn.createOffer(function(sdp){
			self.conn.setLocalDescription(sdp);
			self.network.signal('sdp', {
				sdp: sdp,
				to: self.uid
			});
		}, function(){});
	};
	prototype.createAnswer = function(sdp){
		var self;
		self = this;
		this.conn.createAnswer(function(sdp){
			self.conn.setLocalDescription(sdp);
			self.network.signal('sdp', {
				sdp: sdp,
				to: self.uid
			});
		}, function(){});
	};
	prototype.createDataChannel = function(label){
		var self, x$;
		self = this;
		x$ = this.dataChannel = this.conn.createDataChannel(label);
		x$.onerror = function(it){
			console.error("Peer " + self.uid + " DataChannel Error:", it);
		};
		x$.onopen = function(){
			self.emit('datachannelopen', self);
		};
		x$.onclose = function(){
			self.emit('datachannelclose', self);
		};
		x$.onmessage = function(event){
			self.onmessage(
				JSON.parse(
					event.data));
		};
		return x$;
	};
	prototype.ondatachannel = function(channel){
		var self, x$;
		self = this;
		x$ = this.dataChannel = channel;
		x$.onerror = function(it){
			console.error("Peer " + self.uid + " DataChannel Error:", it);
		};
		x$.onopen = function(){
			self.emit('datachannelopen', self);
		};
		x$.onclose = function(){
			self.emit('datachannelclose', self);
		};
		x$.onmessage = function(event){
			self.onmessage(
				JSON.parse(
					event.data));
		};
	};
	prototype.onmessage = function(it){
		this.emit('message', it);
		this.emit(it.event, it.data);
	};
	prototype.send = function(event, data){
		var ref$;
		if ((ref$ = this.dataChannel) != null) {
			ref$.send(
				JSON.stringify(
					{
						event: event,
						data: data
					}));
		}
	};
	prototype.disconnect = function(){
		var ref$;
		if (!(this.uid in this.network.peers)) {
			return;
		}
		this.rooms = [];
		delete this.network.peers[this.uid];
		if ((ref$ = this.dataChannel) != null) {
			ref$.close();
		}
		if (this.conn.signalingState !== 'closed') {
			this.conn.close();
		}
		this.emit('disconnect');
	};
	return Peer;
}(EventEmitter));
function extend$(sub, sup){
	function fun(){} fun.prototype = (sub.superclass = sup).prototype;
	(sub.prototype = new fun).constructor = sub;
	if (typeof sup.extended == 'function') sup.extended(sub);
	return sub;
}
function import$(obj, src){
	var own = {}.hasOwnProperty;
	for (var key in src) if (own.call(src, key)) obj[key] = src[key];
	return obj;
}
export default PeerNetwork;
