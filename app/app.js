class IsmeretlenekApp {
    constructor() {
        this.selectFields = null;
        this.hasOpenField = false;
        
        this.formContainer = $('.form-container');
        this.chatContainer = $('.chat-container');
        // this.chatFormContainer = $('.chat-form-container');
        
        this.statContainer = $('.stat');
        this.statUsers = this.statContainer.find('.users');
        this.statMan = this.statContainer.find('.man');
        this.statWoman = this.statContainer.find('.woman');
        this.statWantsMan = this.statContainer.find('.wants-man');
        this.statWantsWoman = this.statContainer.find('.wants-woman');
        this.statWantsAnyone = this.statContainer.find('.wants-anyone');
        
        // semi-transparent fade screen with an infinite animated rotating text on the center
        this.fadeContainer = $('.fade');
        
        this._userId = -1;
        this._userToken = null;
        this._gender = 'man';
        this._otherGender = 'anyone';
        this._socketId = null;
        
        this.socket = null;
        
        this.init();
    }
    
    init() {
        // for hold the css flex display, but let it be hidden
        this.fadeContainer
            .css('visibility', 'visible')
            .hide();
        
        this.initSelectFields();
        this.initPageEvents();
        this.initSocketIO();
    }
    
    /**
     * Init the custom select fields
     */
    initSelectFields() {
        this.selectFields = $('[data-type="select"]');
        
        this.selectFields.each((index, selectField) => {
            const $selectField = $(selectField),
                defaultElement = $selectField.data('defaultValue');
            
            const selectedElement = defaultElement ? $(`[data-value="${defaultElement}"]`) : $selectField.find(':first'),
                selectedText = selectedElement.html(),
                selectedValue = selectedElement.data('value');
            
            $selectField.prepend(`<div class="selected">${selectedText}</div>`);
            
            const options = $selectField.find(':not(.selected)');
            $selectField.append(`<div class="options" />`);
            
            const optionsContainer = $selectField.find('.options');
            optionsContainer.append(options);
            
            $selectField
                .attr('tabIndex', 0)
                .attr('data-selected-value', selectedValue);
        });
    }
    
    /**
     * Init the events of the whole app
     */
    initPageEvents() {
        const self = this;
        
        /**
         * Click event or enter keypress when select field in focus
         */
        this.selectFields.on('click keydown', function (ev) {
            if (ev.type === 'keydown' && ev.keyCode !== 13) {
                return;
            }
            
            self.hasOpenField = true;
            
            $(this).addClass('open');
        });
        
        /**
         * Blur event for select field
         */
        this.selectFields.on('blur', function () {
            if (!self.hasOpenField) {
                return;
            }
            
            self.selectFields.removeClass('open');
            self.hasOpenField = false;
        });
        
        /**
         * Click an option in select field
         */
        this.selectFields.find('.options div')
            .on('click', function () {
                const selectField = $(this).closest('[data-type="select"]'),
                    selectVisibleField = selectField.find('.selected:first'),
                    newValue = $(this).data('value'),
                    newText = $(this).html();
                
                selectField.attr('data-selected-value', newValue);
                selectVisibleField.html(newText);
                
                setTimeout(() => {
                    self.selectFields.trigger('blur');
                }, 50);
            });
        
        /**
         * Enter to searching and chat
         */
        $('.chat-button').on('click', function () {
            if (self.formContainer.is(':visible')) {
                self.chatApp();
            }
        });
        
        /**
         * Close the active messaging and pairing
         */
        $('.close').on('click', function () {
            if (self.chatContainer.is(':visible')) {
                self.socket.emit('close', {
                    userId: self.userId(),
                    userToken: self.userToken()
                });
                
                self.chatContainer.fadeOut(400, () => {
                    $('.messages').html('');
                    
                    self.formContainer.fadeIn();
                });
            }
        });
        
        /**
         * Message send by click button
         */
        $('.send').on('click', function () {
            if (self.chatContainer.is(':visible')) {
                self.sendMessage();
            }
        });
        
        /**
         * Message send by enter key
         * @param {event} ev
         */
        $('.message-box').on('keydown', function (ev) {
            if (!ev.shiftKey && ev.keyCode === 13 && self.chatContainer.is(':visible')) {
                self.sendMessage();
            }
        });
    }
    
    /**
     * Send the text of the messagebox
     */
    sendMessage() {
        const messageBox = $('.message-box');
        
        // check the message that it contains only whitespaces
        const isBlank = !!(messageBox.val()
            .match(/^\s+$/g));
        
        if (isBlank) {
            return;
        }
        
        // remove whitespaces from the starting, the ending and remove 2+ linebreaks
        let message = messageBox.val()
            .substr(0, 200)
            .replace(/^\s+|\s+$|(?<=\n{2})\n*/g, '');
        
        if (!message.length) {
            return;
        }
        
        // readonly message field to avoid flood
        messageBox.attr('readonly', 'readonly')
            .val(message);
        
        this.socket
            .emit('message', {
                message: message,
                userId: this.userId(),
                userToken: this.userToken()
            });
    }
    
    /**
     * Init the socketIO module of NodeJS
     */
    initSocketIO() {
        this.socket = io();
        
        this.initSocketEvents();
    }
    
    /**
     * Init the events of the async connect
     */
    initSocketEvents() {
        const self = this,
            cookieUserId = this.localStorage('userId') !== '' ? Number(this.localStorage('userId')) : -1,
            cookieUserToken = this.localStorage('userToken'),
            cookieUserGender = this.localStorage('gender'),
            cookieUserOtherGender = this.localStorage('otherGender'),
            alreadyVisited = !!(cookieUserId !== -1 && cookieUserToken);
        
        // login message to the server with verification
        if (alreadyVisited) {
            this.socket
                .emit('enter', {
                    userId: cookieUserId,
                    userToken: cookieUserToken,
                    gender: cookieUserGender,
                    otherGender: cookieUserOtherGender
                });
            
            this.gender(cookieUserGender);
            this.otherGender(cookieUserOtherGender);
            
            // set the text of fields defaultly
            const genderField = $('.select.gender'),
                otherGenderField = $('.select.other-gender');
            
            genderField
                .attr('data-selected-value', this.gender())
                .find('.selected')
                    .html(genderField.find(`[data-value="${this.gender()}"]`).html());
            
            otherGenderField
                .attr('data-selected-value', this.otherGender())
                .find('.selected')
                    .html(otherGenderField.find(`[data-value="${this.otherGender()}"]`).html());
        }
        
        // login message to the server first time
        else {
            this.socket
                .emit('enter', {
                    gender: self.gender(),
                    otherGender: self.otherGender()
                });
        }
        
        // login message received from the server
        this.socket.on('enter', function (newUserData) {
            if (typeof newUserData === 'boolean') {
                if (!newUserData) {
                    // server says something's wrong here, so we send again the login
                    self.resendSocketEnter();
                } else {
                    self.userId(Number(self.localStorage('userId')));
                    self.userToken(self.localStorage('userToken'));
                    
                    if (self.userId() === -1) {
                        // something's wrong here, we send again the login
                        self.resendSocketEnter();
                    } else {
                        self.fadeContainer.fadeOut();
                    }
                }
            } else {
                self.userId(newUserData.userId);
                self.userToken(newUserData.userToken);
                
                self.socketId(newUserData.socketId);
                
                self.localStorage('gender', self.gender());
                self.localStorage('otherGender', self.otherGender());
                
                if (self.userId() === -1) {
                    // something's wrong here, we send again the login
                    self.resendSocketEnter();
                } else {
                    self.fadeContainer.fadeOut();
                }
            }
        });
        
        // ping to keep alive the connection
        this.socket.on('hello', function () {
            if (self.userId() === -1 || self.userToken() === '') {
                return;
            }
            
            self.socket.emit('hello', {
                userId: self.userId(),
                userToken: self.userToken()
            });
        });
        
        // when you are bad
        this.socket.on('byebye', function () {
            self.gender('');
            self.otherGender('');
            
            self.resendSocketEnter();
        });
        
        // refresh the statistics of main page
        this.socket.on('stats', function (stat) {
            self.statUsers.html(stat.users);
            self.statMan.html(stat.man);
            self.statWoman.html(stat.woman);
            self.statWantsMan.html(stat.wantsMan);
            self.statWantsWoman.html(stat.wantsWoman);
            self.statWantsAnyone.html(stat.wantsAnyone);
        });
        
        // user paired to another, change screen to chat
        this.socket.on('pair', function () {
            self.fadeContainer.fadeOut();
            
            self.formContainer.fadeOut(400, () => {
                self.chatContainer.fadeIn();
                $('.message-box').focus();
            });
        });
        
        // get the ID of the connection
        this.socket.on('socketId', function (uniqueId) {
            self.socketId(uniqueId);
        });
        
        // giving the message from the sender
        this.socket.on('message', function (message) {
            $('.messages').append(`<div class="message"><span>Ismeretlen</span>: ${message}</div>`);
        });
        
        // message send success
        this.socket.on('messageSent', function () {
            $('.messages').append(`<div class="message"><span>Te</span>: ${$('.message-box').val()}</div>`);
            
            $('.message-box')
                .removeAttr('readonly')
                .val('')
                .focus();
        });
        
        // another user closed the messaging, so we going to main screen
        this.socket.on('close', function () {
            if (self.chatContainer.is(':visible')) {
                // TODO: need a better solution; a message to the chat: sorry, another closed, ....
                self.chatContainer.fadeOut(400, () => {
                    $('.messages').html('');
                    
                    self.formContainer.fadeIn();
                });
            }
        });
        
        // for any reason that the connection to a server is lost
        this.socket.on('disconnect', function () {
            // TODO: need a better solution - eg: popup with message
            window.location.reload();
        });
    }
    
    /**
     * Send again the login to the server
     */
    resendSocketEnter() {
        this.fadeContainer.fadeIn();
                    
        this.userId(-1);
        this.userToken('');
        
        setTimeout(() => {
            this.socket
                .emit('enter', {
                    gender: this.gender(),
                    otherGender: this.otherGender()
                });
        }, 500);
    }
    
    /**
     * Get (or set only first time) the userID
     * @param {number} [newId]
     * @return {number}
     */
    userId(newId) {
        if (this._userId !== -1 || typeof newId !== 'number') {
            return this._userId;
        }
        
        this._userId = newId;
        this.localStorage('userId', newId);
        return newId;
    }
    
    /**
     * Get (or set only first time) the userToken
     * @param {string} [newToken]
     * @return {string}
     */
    userToken(newToken) {
        if (this._userToken !== null || !newToken || typeof newToken !== 'string') {
            return this._userToken;
        }
        
        this._userToken = newToken;
        this.localStorage('userToken', newToken);
        return newToken;
    }
    
    /**
     * Get (blank parameter) or set the gender value
     * @param {string} [newGender]
     * @return {string}
     */
    gender(newGender) {
        if (!newGender || typeof newGender !== 'string') {
            return this._gender;
        }
        
        const possibleValues = [
            'man',
            'woman'
        ];
        
        if (possibleValues.indexOf(newGender) === -1) {
            newGender = possibleValues[0];
        }
        
        this._gender = newGender;
        this.localStorage('gender', newGender);
        
        return newGender;
    }
    
    /**
     * Get (blank parameter) or set the other party's gender value
     * @param {string} [newGender]
     * @return {string}
     */
    otherGender(newGender) {
        if (!newGender || typeof newGender !== 'string') {
            return this._otherGender;
        }
        
        const possibleValues = [
            'anyone',
            'man',
            'woman'
        ];
        
        if (possibleValues.indexOf(newGender) === -1) {
            newGender = possibleValues[0];
        }
        
        this._otherGender = newGender;
        this.localStorage('otherGender', newGender);
        
        return newGender;
    }
    
    /**
     * Get or set the ID of the connection
     * @param {string} [uniqueId]
     * @return {string}
     */
    socketId(uniqueId) {
        if (uniqueId && typeof this._socketId !== 'string') {
            this._socketId = uniqueId;
        }
        
        return this._socketId;
    }
    
    /**
     * Change the "main screen" to the "wait screen" and after the "chat application"
     */
    chatApp() {
        this.gender($('.select.gender').data('selected-value'));
        this.otherGender($('.select.other-gender').data('selected-value'));
        
        this.fadeContainer.fadeIn();
        
        this.socket.emit('search', {
            userId: this.userId(),
            userToken: this.userToken(),
            gender: this.gender(),
            otherGender: this.otherGender(),
            socketId: this.socketId()
        });
        
        // then wait for pairing
    }
    
    /**
     * Set a (new) cookie for 1 days
     * @param {string} cookieName
     * @param {string} [cookieValue]
     * @return {string}
     */
    localStorage(cookieName, cookieValue) {
        if (typeof cookieValue !== 'number' && typeof cookieValue !== 'string') {
            const name = `${cookieName}=`,
                decodedCookie = decodeURIComponent(document.cookie),
                cookieArray = decodedCookie.split(';');
            
            for (let i = 0, n = cookieArray.length; i < n; i++) {
                let c = cookieArray[i];
                
                while (c.charAt(0) === ' ') {
                    c = c.substring(1);
                }
                
                if (c.indexOf(name) === 0) {
                    return c.substring(name.length, c.length);
                }
            }
            
            return '';
        } else {
            const date = new Date();
            date.setTime(date.getTime() + (1 * 24 * 60 * 60 *1000));
            
            const expires = `expires=${date.toUTCString()}`;
            
            document.cookie = `${cookieName}=${cookieValue};${expires};path=/`;
            
            return cookieValue;
        }
    }
}

$(document).ready(() => {
    const ismeretlenekApp = new IsmeretlenekApp();
});
