// server.js
const WebSocket = require('ws');
const fetch = require('node-fetch');

const wss = new WebSocket.Server({ port: 8080 });

const adaloAPI = "https://api.adalo.com/v1/records";
const collectionID = "t_33807262f91a45988d3128c8aeead12e";
const apiKey = "4k7rz5dia60rov7bi4ncnyrgd";

let rooms = {}; // store rooms and moves

wss.on('connection', ws => {
    ws.on('message', message => {
        const data = JSON.parse(message);
        const { type, roomID, player, move } = data;

        if(type === "join") {
            if(!rooms[roomID]) rooms[roomID] = { players: [], board: ["","","","","","","","",""], currentPlayer: "X" };
            rooms[roomID].players.push({ name: player, ws });
            ws.send(JSON.stringify({ type: "joined", symbol: rooms[roomID].players.length === 1 ? "X" : "O" }));
        }

        if(type === "move") {
            const room = rooms[roomID];
            if(!room || room.board[move] !== "") return;

            room.board[move] = room.currentPlayer;
            room.currentPlayer = room.currentPlayer === "X" ? "O" : "X";

            // Broadcast updated board to all players
            room.players.forEach(p => p.ws.send(JSON.stringify({ type: "update", board: room.board, currentPlayer: room.currentPlayer })));

            // Check winner
            const winner = checkWinner(room.board);
            if(winner) {
                const winnerName = room.players.find(p => p.ws.symbol === winner).name || "Unknown";
                room.players.forEach(p => p.ws.send(JSON.stringify({ type: "end", winner: winnerName })));

                // Send result to Adalo automatically
                sendResultToAdalo(room.players[0].name, room.players[1].name, winnerName, roomID);

                // Clear room
                delete rooms[roomID];
            }
        }
    });
});

function checkWinner(b) {
    const winConditions = [
        [0,1,2],[3,4,5],[6,7,8],
        [0,3,6],[1,4,7],[2,5,8],
        [0,4,8],[2,4,6]
    ];
    for(let cond of winConditions){
        const [a,b1,c] = cond;
        if(b[a] && b[a]===b[b1] && b[a]===b[c]) return b[a];
    }
    return null;
}

function sendResultToAdalo(player1, player2, winner, roomID){
    const data = {
        collection_id: collectionID,
        record: {
            Player1: player1,
            Player2: player2,
            Winner: winner,
            RoomID: roomID
        }
    };
    fetch(adaloAPI, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(data)
    }).then(res => res.json()).then(res => console.log("Adalo updated", res)).catch(err=>console.error(err));
}

console.log("WebSocket server running on ws://localhost:8080");

