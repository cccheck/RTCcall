'use strict';

console.log("V6");

var module_voice = {};

module_voice.uid //uid, later unique name
module_voice.localStream;
module_voice.pc = {};
module_voice.remoteStreamA;
module_voice.remoteStreamB;
module_voice.turnReady;
module_voice.turnServer = 'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913';

module_voice.pcConfig = {
  'iceServers': [{
    'urls': 'stun:stun.l.google.com:19302'
  }]
};

// Set up audio and video regardless of what devices are present.
module_voice.sdpConstraints = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: false
};

module_voice.constraints = {
  audio: true
};

/////////////////////////////////////////////

var socket = io.connect();

socket.on('created', function(myId) {
  //first, created room
  module_voice.uid = myId;
});

socket.on('full', function(room) {
  console.log('Room ' + room + ' is full');
});

socket.on('join', function (targetId)
{
    //someone else joins
  
    console.log("OTHER JOINED",targetId)
  
    module_voice.createPeerConnection(targetId);
    module_voice.pc[targetId].addStream(module_voice.localStream);
    module_voice.pc[targetId].state = "stream added";

    //sending offer
    console.log("DOCALL",targetId,module_voice.pc[targetId])
    module_voice.pc[targetId].createOffer(
        module_voice.setLocalAndSendMessage.bind(null,targetId),
        module_voice.handleCreateOfferError
    );
});

socket.on('joined', function(myId) {
  module_voice.uid = myId;
  //you joined room
});


////////////////////////////////////////////////

module_voice.sendMessage = function(message,to) 
{
    //sending message, this is used for signaling, might get merged into normal "send message" function in B&D
    console.log("SEND MESSAGE", message);
    message.uid = module_voice.uid;
    message.to = to;
    socket.emit('message', message);
}

// This client receives a message
socket.on('message', function(message) {
    
if(module_voice.uid === message.to)
{
  console.log("GET MESSAGE", message);
  if (message.data && message.data.type === 'offer') 
  {
    if (module_voice.pc[message.uid] === undefined) {
        module_voice.createPeerConnection(message.uid);
        module_voice.pc[message.uid].addStream(module_voice.localStream);

        module_voice.pc[message.uid].setRemoteDescription(new RTCSessionDescription(message.data));
        module_voice.pc[message.uid].state = "description added";
        
        module_voice.pc[message.uid].createAnswer().then(
        module_voice.setLocalAndSendMessage.bind(null,message.uid),
        module_voice.onCreateSessionDescriptionError
      );
    }
  } 
  else if (message.data && message.data.type === 'answer') 
  {
    if (module_voice.pc[message.uid].state === "stream added") 
    {
        module_voice.pc[message.uid].setRemoteDescription(new RTCSessionDescription(message.data));
        module_voice.pc[message.uid].state = "description added";
    }
  } 
  else if (message.data.type === 'candidate') 
  {
    if (module_voice.pc[message.uid].state === "description added") 
    {
        var candidate = new RTCIceCandidate({
          sdpMLineIndex: message.label,
          candidate: message.data.candidate
        });
        module_voice.pc[message.uid].addIceCandidate(candidate);
    }
  } 
  else if (message.text === 'bye') 
  {
    module_voice.handleRemoteHangup(message.uid);
  }
}
});

////////////////////////////////////////////////////

//need way to combine multiple incoming streams here, look into webAudio API
module_voice.remoteAudioA = document.getElementById('remoteAudio1');
module_voice.remoteAudioB = document.getElementById('remoteAudio2');

async function start() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: false});

    module_voice.stream = stream;
    module_voice.localStream = stream;

    if (location.hostname !== 'localhost') {
        module_voice.requestTurn(
        module_voice.turnServer
      );
    }

    socket.emit('create or join');

  } catch (e) {
    alert(`getUserMedia() error: ${e.name}`);
  }
}
start();



window.onbeforeunload = function() {
  // module_voice.sendMessage({text:'bye'});
};

/////////////////////////////////////////////////////////

module_voice.createPeerConnection = function(uid) {
  try {
    module_voice.pc[uid] = new RTCPeerConnection(null);
    module_voice.pc[uid].onicecandidate = module_voice.handleIceCandidate.bind(null,uid);
    module_voice.pc[uid].onaddstream = module_voice.handleRemoteStreamAdded.bind(null,uid);
    module_voice.pc[uid].onremovestream = module_voice.handleRemoteStreamRemoved;
  } catch (e) {
    console.log('Cannot create RTCPeerConnection object.');
    return;
  }
}

module_voice.handleIceCandidate = function(uid,event) {
  if (event.candidate) {
    module_voice.sendMessage({data:{
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    }},
    uid);
  } else {
    console.log('End of candidates.');
    //module_voice.pc[uid].state = "candidates";
  }
}

module_voice.handleCreateOfferError = function(event) {
  console.log('createOffer() error: ', event);
}


module_voice.setLocalAndSendMessage = function(uid,sessionDescription) 
{
  module_voice.pc[uid].setLocalDescription(sessionDescription);
  module_voice.sendMessage({data:sessionDescription},uid);
}

module_voice.onCreateSessionDescriptionError = function(error) 
{
  console.log('Failed to create session description: ' + error.toString());
}

module_voice.requestTurn = function(turnURL) {
  var turnExists = false;
  for (var i in module_voice.pcConfig.iceServers) {
    if (module_voice.pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
      turnExists = true;
      module_voice.turnReady = true;
      break;
    }
  }
  if (!turnExists) {
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4 && xhr.status === 200) {
        var turnServer = JSON.parse(xhr.responseText);
        pcConfig.iceServers.push({
          'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
          'credential': turnServer.password
        });
        module_voice.turnReady = true;
      }
    };
    xhr.open('GET', turnURL, true);
    xhr.send();
  }
}

module_voice.handleRemoteStreamAdded = function(uid,event) 
{
    if(module_voice.remoteStreamA === undefined)
    {
        module_voice.remoteStreamA = event.stream;
        module_voice.remoteAudioA.srcObject = module_voice.remoteStreamA;
    }
    else
    {
        module_voice.remoteStreamB = event.stream;
        module_voice.remoteAudioB.srcObject = module_voice.remoteStreamB;
    }
}

module_voice.handleRemoteStreamRemoved = function(event) {
  console.log('Remote stream removed. Event: ', event);
}

module_voice.hangup = function(uid) {
  module_voice.stop(uid);
  //module_voice.sendMessage({text:'bye'});
}

module_voice.handleRemoteHangup = function(uid)
{
  module_voice.stop(uid);
}

module_voice.stop = function(uid) {
  module_voice.pc[uid].close();
  module_voice.pc[uid] = null;
}
