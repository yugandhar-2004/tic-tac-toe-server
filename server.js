// server.js
const WebSocket = require('ws');
const fetch = require('node-fetch');

const wss = new WebSocket.Server({ port: 8080 });

const adaloAPI = "https://api.adalo.com/v1/records";
const collectionID = "t_33807262f91a45988d3128c8aeead12e"; // Your Users collection
const apiKey = "4k7rz5dia60rov7bi4ncnyrgd"; // Your API key

let rooms = {}; // store rooms and moves

// WebSocket connection
wss.on('connection', ws => {
    ws.on('message', message => {
        const data = JSON.parse(message);
        const { type, roomID, player, move } = data;

        // Player joins room
        if(type === "join") {
            if(!rooms[roomID]) {
                rooms[roomID] = {
                    players: [],
                    board: ["","","","","","","","",""],
                    currentPlayer: "X"
                };
            }
            rooms[roomID].players.push({ name: player, ws });
            ws.send(JSON.stringify({ type: "joined", symbol: rooms[roomID].players.length === 1 ? "X" : "O" }));
        }

        // Player makes a move
        if(type === "move") {
            const room = rooms[roomID];
            if(!room || room.board[move] !== "") return;

            room.board[move] = room.currentPlayer;
            room.currentPlayer = room.currentPlayer === "X" ? "O" : "X";

            // Broadcast updated board to all players
            room.players.forEach(p => p.ws.send(JSON.stringify({
                type: "update",
                board: room.board,
                currentPlayer: room.currentPlayer
            })));

            // Check winner
            const winnerSymbol = checkWinner(room.board);
            if(winnerSymbol) {
                const winnerPlayer = room.players.find(p => (room.players.indexOf(p) === 0 ? "X" : "O") === winnerSymbol);
                const winnerName = winnerPlayer ? winnerPlayer.name : "Unknown";

                // Notify all players
                room.players.forEach(p => p.ws.send(JSON.stringify({
                    type: "end",
                    winner: winnerName
                })));

                // Update winner's coins in Adalo
                sendResultToAdalo(winnerName);

                // Clear room
                delete rooms[roomID];
            }
        }
    });
});

// Function to check winner
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
function sendResultToAdalo(winner) {
    const coinsToAdd = 10; // Coins to add

    // 1️⃣ Find winner in Adalo
    fetch(`${adaloAPI}?collection_id=${collectionID}&filter={"Full Name":"${winner}"}`, {
        headers: { "Authorization": `Bearer ${apiKey}` }
    })
    .then(res => res.json())
    .then(data => {
        if(data && data.records && data.records.length > 0) {
            const userID = data.records[0].id;
            const currentCoins = data.records[0].Coins || 0;

            // 2️⃣ Update Coins using correct URL and body
            fetch(`${adaloAPI}/${userID}`, { // PATCH to /records/{record_id}
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    Coins: currentCoins + coinsToAdd
                })
            })
            .then(res => res.json())
            .then(res => console.log(`Coins updated for ${winner}:`, res))
            .catch(err => console.error("Error updating coins:", err));

        } else {
            console.error(`Winner ${winner} not found in database`);
        }
    })
    .catch(err => console.error("Error fetching winner record:", err));
}


console.log("WebSocket server running on ws://localhost:8080");

