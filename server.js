const
    express = require("express"),
    app = express();

// the requested port for the server
const serverPort = 1337;
// public directory for the http server /for the client's browser/
const publicDir = '/app';
// for memory cleaning and deleting inactive users from global user object
let checkActiveUserSeconds = 15;
let maxTimeoutSeconds = 5;
// time in seconds for the pairing cycle to alone users
const pairCycleTimeSeconds = 3;

const http = require('http').Server(app);
const io = require('socket.io')(http);
const crypto = require('crypto'),
    // creates a random salt for unique token generation
    salt = crypto.createHash('sha256')
        .update(`${Math.floor(Math.random() * 999999999)}`)
        .digest('hex');

// app gives a directory to share it and it's content to user's browser
app.use(express.static(__dirname + publicDir));

/**
 * Create an MD5 hash from a given string
 * @param {string} originalText
 * @return {string}
 */
function hash(originalText) {
    hashText = `${originalText}`;
    
    if (!hashText.length) {
        return '';
    }
    
    return crypto.createHash('md5')
        .update(salt + hashText + salt)
        .digest('hex');
}

/**
 * Get the user's gender
 * @param {string} userGender
 * @param {boolean} [otherUser]
 * @return {boolean|string}
 */
function gender(userGender, otherUser = false) {
    if (!userGender || typeof userGender !== 'string') {
        return false;
    }
    
    const possibleValues = {
        thisUser: [
            'man',
            'woman'
        ],
        
        otherUser: [
            'man',
            'woman',
            'anyone'
        ]
    };
    
    const thisUserValues = !otherUser ? 'thisUser' : 'otherUser';
    
    if (possibleValues[thisUserValues].indexOf(userGender) > -1) {
        return userGender;
    }
}

// object that contains all users with available data (id, gender)
const users = {};
// memory cleaning array - active users must be pinged, and pushed to in
let userActive = [];
// momently pairable users
const userAre = {};
const userWants = {};
// currently paired users
const pairedUser = {};

// statistics for the main page
const stat = {
    users: 0,
    man: 0,
    woman: 0,
    wantsMan: 0,
    wantsWoman: 0,
    wantsAnyone: 0
};

// unique number for all /new/ user
let userIds = 0;

/**
 * Add a new user to global user object as properly
 * @param {object} userData
 */
function addUser(userData) {
    users[`${userData.userId}`] = userData;
    
    // to avoid problems with memory management
    if (userActive.indexOf(userData.userId) === -1) {
        userActive.push(userData.userId);
    }
}

/**
 * First letter to uppercase
 * @param {string} originalText
 */
function FLUTC(originalText) {
    return `${originalText.substr(0, 1).toLocaleUpperCase() + originalText.substr(1)}`;
}

// set a minimal timeout
checkActiveUserSeconds = Math.max(5, checkActiveUserSeconds);
maxTimeoutSeconds = Math.max(5, maxTimeoutSeconds);

// for security reasons; do not stack this timeout
if (Math.floor(maxTimeoutSeconds) >= Math.floor(checkActiveUserSeconds)) {
    maxTimeoutSeconds = checkActiveUserSeconds - 1;
}

/**
 * A repeated event to clean memory and remove inactive users
 */
let helloUsersCycle = setInterval(() => {
    userActive = [];
    
    io.emit('hello', true);
    
    setTimeout(checkHelloMessages, maxTimeoutSeconds * 1000);
}, checkActiveUserSeconds * 1000);

/**
 * Check active users, and delete inactive ones
 */
function checkHelloMessages() {
    stat.users = 0;
    stat.man = 0;
    stat.woman = 0;
    stat.wantsMan = 0;
    stat.wantsWoman = 0;
    stat.wantsAnyone = 0;
    
    for (i in users) {
        if (userActive.indexOf(Number(i)) === -1) {
            users[`${i}`] = null;
            delete users[`${i}`];
        } else {
            stat['users'] ++;
            stat[users[`${i}`].gender] ++;
            stat[`wants${FLUTC(users[`${i}`].otherGender)}`] ++;
        }
    }
    
    // broadcast the stats for all user
    io.emit('stats', stat);
    
    /*
    // debug
    console.log('users: ' + Object.keys(users).length + '; active: ' + userActive.length);
    console.log(stat);
    */
}

/**
 * Check the given user that aren't fake
 * @param {object} userData
 * @return {boolean}
 */
function checkToken(userData) {
    if (typeof userData.userId !== 'number' || typeof userData.userToken !== 'string') {
        return false;
    }
    
    const user = users[`${userData.userId}`];
    
    if (user && user.userToken === userData.userToken) {
        return true;
    }
    
    return false;
}

/**
 * Pair user with a waiting one
 * @param {object} socket
 * @param {object} userData
 */
function pairWithUser(socket, userData) {
    // if already paired the user, stop that
    if (pairedUser[userData.userId]) {
        socket.emit('pair', true);
        return;
    }
    
    // no one is waiting, so this user will do it
    if (!Object.keys(userAre).length) {
        userAre[`${userData.userId}`] = userData.gender;
        userWants[`${userData.userId}`] = userData.otherGender;
        
        return;
    }
    
    // get a list about the waiting users that are have the wanted gender
    const genderList = Object.keys(userAre),
        genders = {
            man: [],
            woman: []
        };
    
    const wantsList = Object.keys(userWants),
        wants = {
            man: [],
            woman: [],
            anyone: []
        };
    
    for (let i = 0, n = genderList.length; i < n; i++) {
        genders[userAre[genderList[i]]]
            .push(genderList[i]);
        
        wants[userWants[wantsList[i]]]
            .push(wantsList[i]);
    }
    
    // then look a user from the list with right gender
    let othersList = [];
    
    if (userData.otherGender === 'anyone') {
        othersList = genders['man'].concat(genders['woman']);
    } else {
        othersList = genders[userData.otherGender];
    }
    
    if (!othersList.length) {
        return;
    }
    
    // users that pairable with first user
    const pairableUsers = [];
    
    for (let i = 0, n = othersList.length; i < n; i++) {
        if (wants[userData.gender].indexOf(othersList[i]) > -1 || wants['anyone'].indexOf(othersList[i]) > -1) {
            pairableUsers.push(othersList[i]);
        }
    }
    
    if (!pairableUsers.length) {
        return;
    }
    
    const secondUser = pairableUsers[Math.floor(Math.random() * pairableUsers.length)];
    
    pairedUser[`${userData.userId}`] = `${secondUser}`;
    pairedUser[`${secondUser}`] = `${userData.userId}`;
    
    const firstSocketId = users[userData.userId].socketId,
        secondSocketId = users[secondUser].socketId;
    
    // notify the clients and send to chat screen
    io.to(firstSocketId).emit('pair', true);
    io.to(secondSocketId).emit('pair', true);
    
    userAre[`${userData.userId}`] = null;
    delete userAre[`${userData.userId}`];
    userWants[`${userData.userId}`] = null;
    delete userWants[`${userData.userId}`];
    
    userAre[`${secondUser}`] = null;
    delete userAre[`${secondUser}`];
    userWants[`${secondUser}`] = null;
    delete userWants[`${secondUser}`];
}

/**
 * Connection of a user
 * @param {object} socket
 */
io.on('connection', function (socket) {
    /**
     * New user join or a previous are reconnecting
     * @param {object} userData
     */
    socket.on('enter', function (userData) {
        const userDataReal = !!(gender(userData.gender) && gender(userData.otherGender, true));
        
        if (!userDataReal) {
            // this user tried to send non existing gender, so we say a goodbye for it (and give a new identity)
            socket.emit('byebye', true);
        } else {
            // user already visited the app
            if (typeof userData.userId === 'number' && typeof userData.userToken === 'string') {
                if (hash(userData.userId) === userData.userToken) {
                    // verification success, welcome
                    userData.socketId = socket.id;
                    addUser(userData);
                    
                    socket.emit('socketId', socket.id);
                    
                    socket.emit('enter', true);
                    socket.emit('stats', stat);
                    
                    if (pairedUser[userData.userId]) {
                        socket.emit('pair', true);
                    }
                } else {
                    // verification failed, give a new identity
                    socket.emit('enter', false);
                }
            }
            // new user, gives unique identity
            else {
                const newUser = {
                    userId: userIds,
                    userToken: hash(userIds ++),
                    gender: userData.gender,
                    otherGender: userData.otherGender,
                    socketId: socket.id
                };
                
                addUser(newUser);
                
                socket.emit('enter', newUser);
                socket.emit('stats', stat);
            }
        }
    });
    
    /**
     * An user send hello response to keep alive connection
     * @param {object} userData
     */
    socket.on('hello', function (userData) {
        if (checkToken(userData)) {
            if (userActive.indexOf(userData.userId) === -1) {
                userActive.push(userData.userId);
            }
        } else {
            // this user failed the verification, so we say a goodbye for it (and give a new identity)
            socket.emit('byebye', true);
        }
    });
    
    /**
     * An user clicked the chat button, so we find a partner for her/his
     * @param {object} userData
     */
    socket.on('search', function (userData) {
        if (checkToken(userData)) {
            pairWithUser(socket, userData);
        }
    });
    
    /**
     * Forward the message from sender user to addressee
     * @param {string} message
     */
    socket.on('message', function (userData) {
        if (checkToken(userData)) {
            io.to(users[pairedUser[userData.userId]].socketId)
                .emit('message', userData.message.substr(0, 200));
            
            io.to(users[userData.userId].socketId)
                .emit('messageSent', true);
        }
    });
    
    /**
     * User closed the messaging
     * @param {object} userData
     */
    socket.on('close', function (userData) {
        if (checkToken(userData)) {
            // send message to another user
            io.to(users[pairedUser[userData.userId]].socketId)
                .emit('close', true);
            
            pairedUser[userData.userId] = null;
            delete pairedUser[userData.userId];
            
            pairedUser[pairedUser[userData.userId]] = null;
            delete pairedUser[pairedUser[userData.userId]];
        }
    });
});

/**
 * Start the listening socket server on a given port
 */
http.listen(serverPort, function () {
    console.log('> A szerver fut az 1337-es porton.');
});

/*
    TODO: receive last 10 message when refresh the page (from localStorage)
*/
