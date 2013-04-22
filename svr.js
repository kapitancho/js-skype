// A websocket server that is used for the client communication.
var server = require('http').createServer();
var app = server.listen(1337, function() {
  console.log((new Date()) + " Server is listening on port 1337");
});

// create the socket server on the port
var io = require('socket.io').listen(app);

// An object that stores a reference to the socket objects
// of every connected client.
var connectedPeople = {};

// An object that contains information about all 
// pending file transfers.
var openFileTransfers = {};

// A temporary client name generator counter.
var unknownUsersCounter = 0;

var http = require('http');
var fs = require('fs');

// Read and cache the files used in the browsers.
var indexHtml = fs.readFileSync('client/index.html');
var socketIO = fs.readFileSync('client/socket.io.js');

// A simple http server that serves the client file and socket.io.js library.
http.createServer(function (req, res) {
	if (req.url == '/') {
  		res.writeHead(200, {'Content-Type': 'text/html'});
		res.end (indexHtml);
	} else if (req.url == '/socket.io.js') {
		res.writeHead(200, {'Content-Type': 'text/javascript'});
		res.end (socketIO);
	} else {
		res.writeHead(404);
		res.end ("Page not found");
	}
}).listen(9614);

// Another http server that is used for file transfers between the clients.
http.createServer(function (req, res) {
  var code = req.url.substr (1);
  var transfer = openFileTransfers[code];  
  var source;
  if (transfer) {
  	source = connectedPeople[transfer.source];
  }
  if (transfer && source) {  	
	  res.writeHead(200, {'Content-Type': 'application/octet-stream'});
	  
	  // A function that reads data chunks from the file sender and 	  
	  // streams them to the file recipient.
	  var reader = function() {
	  	  source.emit ('transfer_chunk', code, function (chunkData) {
		  	  if (chunkData === null) {
			  	  res.end();
				  res = null;
				  reader = null;
			  } else {
			  	res.write(new Buffer(chunkData, 'base64').toString('ascii'));
				reader();
			  }
		  });
	  };
	  reader();	  
  } else {
	  res.writeHead(404);
	  res.end();
  }
  
}).listen(9615);

// This callback function is called every time a socket
// tries to connect to the server
io.sockets.on('connection', function(socket) {

	// Generate a temporary name for the client until it identifies itself.
	var name = 'unknown user ' + ++unknownUsersCounter;
	connectedPeople[name] = socket;

    console.log((new Date()) + ' Connection established.');
	
	////// Message handlers ///////
	
	// The client sends its real name
	socket.on ('identify', function (person) {
		console.log((new Date()) + ' Person ' + name + ' changed name to : ' + person);
		delete connectedPeople[name];
		name = person;
		connectedPeople[name] = socket;
		
		socket.broadcast.emit('online_status', { user : name, online : true });
	});
	
	// The client searches for a user
	socket.on ('find_user', function (name, callback) {
		callback (connectedPeople[name] ? true : false);
	});

	// The client wants to see who is online (from the contact list)
	socket.on ('check_online', function (userList, callback) {
		var result = {};
		userList.forEach (function (userName) { result[userName] = connectedPeople[userName] ? true : false; });
		callback (result);
	});
	
	// The client sends a message to somebody
	socket.on ('text_message', function (info) {
		console.log((new Date()) + ' Person ' + name + ' sent message to: ' + info.recipient);
		var r = connectedPeople[info.recipient];
		if (r) {
			r.emit ('text_message', { from : name, message : info.message });
		}
	});

	// The client wants to send a file to somebody
	socket.on ('file_transfer_request', function (info) {
		info.source = name;
		openFileTransfers[info.id] = info;
		var recipient = connectedPeople[info.recipient];
		if (recipient) {
			recipient.emit ('incoming_file', info);
		}
	});

	// The client closes the connection
    socket.on('disconnect', function() {
        // close user connection
        console.log((new Date()) + " Peer disconnected.");
        socket.broadcast.emit('online_status', { user : name, online : false });
		
		delete connectedPeople[name];
		socket = null;		
    });

});