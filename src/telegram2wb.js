/*
Telegram bot on wb-rules
v. 2.3.1
*/
bot = {
    //Set in the init() function
    token: "", 								//Bot token can be obtained from @BotFather. 
    users: [], 					            // Array of allowed user names: ["user1"] or ["user1", "user2"]
    deviceName: "telegram2wb", 				// Name of the virtual device to be created
    deviceTitle: "Telegram Bot", 			// Virtual device header
    // Other settings
    pollInterval: 1000, 					//ms Interval for receiving messages from the server
    mqttInterval: 500, 						//ms MQTT-topics verification interval
    curlCommand: "curl -s --connect-timeout 60 --max-time 30 -X POST ", // --max-time — maximum time for one request
    urlServer: "https://api.telegram.org", 	// Telegram server name
    mqttCmd: "Cmd", 						// The topic where the bot publishes commands
    mqttCallback: "Callback", 			    // The topic where the bot publishes callbacks
    mqttMsg: "Msg", 						// The topic from which the bot receives messages to send
    mqttRawMsg: "rawMsg", 					// The topic from which the bot receives raw messages to send
    debugSwitch: "Debug", 					// Debug management topic name
    enabledSwitch: "Enabled", 				// Name of the state management topic
    parseMode: "Markdown", 					// The type of messages to be sent. Available: Markdown, HTML     
}

session = {
    commandsQueue: [], //command, args
    callbacksQueue: [], //callbacks
    lastReadUpdateId: 0,
    pausePoll: false,
    username: "unknown_name",
    isDebugMode: function () {
        return getTopicValue(
            bot.deviceName,
            bot.debugSwitch
        );
    }
}

function init(token, users, deviceName, deviceTitle) {
    bot.token = token;
    bot.users = users;

    if (Boolean(deviceName)) {
        bot.deviceName = deviceName;
    }

    if (Boolean(deviceTitle)) {
        bot.deviceTitle = deviceTitle;
    }

    writeLog("Bot initialization");

    device = defineVirtualDevice(bot.deviceName, {
        title: bot.deviceTitle,
        cells: {}
    });

    device.addControl(bot.enabledSwitch, { type: "switch", value: true });
    device.addControl(bot.debugSwitch, { type: "switch", value: false });
    device.addControl(bot.mqttCmd, { type: "text", value: "{}", readonly: true });
    device.addControl(bot.mqttCallback, { type: "text", value: "{}", readonly: true });
    device.addControl(bot.mqttMsg, { type: "text", value: "{}", readonly: true });
    device.addControl(bot.mqttRawMsg, { type: "text", value: "{}", readonly: true });

    writeLog("Virtual device is created");

    defineRule("pollTimerControl", {
        asSoonAs: function () {
            return dev[bot.deviceName][bot.enabledSwitch];
        },
        then: function () {
            startTicker("pollTimer", bot.pollInterval);
        }
    });

    defineRule("pollTimer_firing", {
        when: function () { return timers.pollTimer.firing; },
        then: function () {
            if (!session.pausePoll) {
                getMessages();
            }

            if (dev[bot.deviceName][bot.enabledSwitch] == false) {
                timers.pollTimer.stop();
            }
        }
    });

    defineRule("mqttTimerControl", {
        asSoonAs: function () {
            return dev[bot.deviceName][bot.enabledSwitch];
        },
        then: function () {
            startTicker("mqttTimer", bot.mqttInterval);
        }
    });

    defineRule("mqttTimer_firing", {
        when: function () { return timers.mqttTimer.firing; },
        then: function () {
            writeMqttCmd();
            writeMqttCallback();
        }
    });

    defineRule("mqttMessage ", {
        whenChanged: "{}/{}".format(bot.deviceName, bot.mqttMsg),
        then: function (newValue, devName, cellName) {
            jsonString = newValue;
            writeDebug("mqttMessage", jsonString);
            dev[devName][cellName] = "{}";

            try {
                msg = JSON.parse(jsonString);
            } catch (error) {
                writeLog("[mqttMessage] Incorrect message format in MQTT topic: {}".format(error.message));
            }
            if (Object.keys(msg).length) {
                sendMessage(msg);
            }
        }
    });

    defineRule("mqttRawMessage ", {
        whenChanged: "{}/{}".format(bot.deviceName, bot.mqttRawMsg),
        then: function (newValue, devName, cellName) {
            jsonString = newValue;
            writeDebug("mqttRawMessage", jsonString);
            dev[devName][cellName] = "{}";

            try {
                msg = JSON.parse(jsonString);
            } catch (error) {
                writeLog("[mqttRawMessage] Incorrect message format in MQTT topic: {}".format(error.message));
            }
            if (Object.keys(msg).length) {
                sendRawMessage(msg);
            }
        }
    });

    defineRule("mqttDebug", {
        whenChanged: "{}/{}".format(bot.deviceName, bot.debugSwitch),
        then: function (newValue, devName, cellName) {
            session.debugMode = newValue;
        }
    });

    writeLog("Connecting to the server...");
    readMeInfo();
}

function readMeInfo() {
    session.pausePoll = true;
    command = '{} {}/bot{}/getMe'.format(
        bot.curlCommand,
        bot.urlServer,
        bot.token
    );

    runShellCommand(command, {
        captureOutput: true,
        exitCallback: function (exitCode, capturedOutput) {
            if (exitCode === 0) {
                if (checkConnectStatus(capturedOutput)) {
                    writeLog("Connected to the server.\n");
                    writeLog(getParsedMeInfo(capturedOutput));
                }
                writeDebug("readMeInfo", "exitCode: {} | capturedOutput:{}".format(
                    exitCode,
                    capturedOutput
                ));
                session.pausePoll = false;
                return;
            }
        }
    });
}

function checkConnectStatus(serverResponse) {
    try {
        response = JSON.parse(serverResponse);
    } catch (error) {
        writeLog("Сonnection error: {}".format(error.message));
        return false;
    }

    try {
        if (response["ok"]) {
            return true;
        } else {
            writeLog(response["description"]);
            return false;
        }
    } catch (error) {
        writeLog("JSON parsing error: {}".format(error.message));
        return false;
    }

}

function getMessages() {
    session.pausePoll = true;
    startUpdateId = session.lastReadUpdateId + 1;
    command = '{} {}/bot{}/getUpdates?offset={}'.format(
        bot.curlCommand,
        bot.urlServer,
        bot.token,
        startUpdateId
    );

    runShellCommand(command, {
        captureOutput: true,
        captureErrorOutput: true,
        exitCallback: function (exitCode, capturedOutput, capturedErrorOutput) {
            if (exitCode === 0) {
                if (checkConnectStatus(capturedOutput)) {
                    parseUpdates(capturedOutput);
                }
                writeDebug("getMessages", "exitCode: {} | capturedOutput:{}".format(
                    exitCode,
                    capturedOutput
                ));
            } else {
                writeLog("[getMessages] exitCode: {} | capturedOutput:{} | capturedErrorOutput:{}".format(
                    exitCode,
                    capturedOutput,
                    capturedErrorOutput
                ));
            }

            session.pausePoll = false;
            return;
        }
    });
}

function getResultType(result) {
    type = "unknown";
    if (result["message"] != undefined) {
        type = "message";
    }

    if (result["edited_message"] != undefined) {
        type = "edited_message";
    }

    if (result["my_chat_member"] != undefined) {
        type = "my_chat_member";
    }

    if (result["callback_query"] != undefined) {
        type = "callback_query";
    }

    return type;
}

function getCommandArgs(text) {
    result = text.match(/"(.*?)"/);
    startPos = 0;

    if (Boolean(result) && result.index === startPos + 1) {
        return result[1];
    } else {
        endPos = text.slice(startPos).indexOf("/");

        if (endPos < 0) {
            endPos = text.length;
        }

        return text.slice(startPos, startPos + endPos).trim();
    }
}

function getPreparedText(text) {
    return text.replace(/'/g, "’");
}

function getTextMessageString(msg) {
    chatId = msg.chatId;
    text = msg.text;
    replyToMessage = msg.messageId;
    keyboard = msg.keyboard;

    var params = "-d chat_id={} -d text='{}' -d parse_mode={} ".format(chatId, getPreparedText(text), bot.parseMode);
    if (Boolean(replyToMessage)) {
        params += "-d reply_to_message_id={} ".format(replyToMessage);
    }
    if (Boolean(keyboard)) {
        params += "-d reply_markup='{}' ".format(keyboard);
    }

    return '{} {}/bot{}/sendMessage {}'.format(
        bot.curlCommand,
        bot.urlServer,
        bot.token,
        params
    );
}

function getDocumentMessageString(msg) {
    chatId = msg.chatId;
    caption = msg.text;
    replyToMessage = msg.messageId;
    document = msg.document.trim();

    var params = "-F chat_id={} -F parse_mode={} -F document='@{}' ".format(
        chatId,
        bot.parseMode,
        document
    );
    if (Boolean(caption)) {
        params += "-F caption='{}' ".format(getPreparedText(caption));
    }
    if (Boolean(replyToMessage)) {
        params += "-F reply_to_message_id={} ".format(replyToMessage);
    }

    return '{} {}/bot{}/sendDocument {}'.format(
        bot.curlCommand,
        bot.urlServer,
        bot.token,
        params
    );
}

function getPhotoMessageString(msg) {
    chatId = msg.chatId;
    caption = msg.text;
    replyToMessage = msg.messageId;
    photo = msg.photo.trim();

    var params = "-F chat_id={} -F parse_mode={} -F photo='@{}' ".format(
        chatId,
        bot.parseMode,
        photo
    );
    if (Boolean(caption)) {
        params += "-F caption='{}' ".format(getPreparedText(caption));
    }
    if (Boolean(replyToMessage)) {
        params += "-F reply_to_message_id={} ".format(replyToMessage);
    }

    return 'curl --data-urlencode -s -X POST {}/bot{}/sendPhoto {}'.format(
        bot.urlServer,
        bot.token,
        params
    );
}

function getMessageType(msg) {
    if (msg.document != undefined) {
        return "document";
    }
    if (msg.photo != undefined) {
        return "photo";
    }
    if (msg.keyboard != undefined) {
        return "keyboard";
    }

    return "text";
}

function getTopicValue(deviceName, topicName) {
    return getDevice(deviceName).getControl(topicName).getValue()
}

function genErrorMessage(msg, ExitCode) {
    errMsg = {
        chatId: msg.chatId,
        messageId: msg.messageId,
        text: "Could not send the result of the command execution. \nExitCode: {}\nSee details in the controller console.".format(ExitCode)
    }

    return errMsg;
}

function sendMessage(msg) {

    msgType = getMessageType(msg);

    switch (msgType) {
        case "text":
        case "keyboard":
            command = getTextMessageString(msg);
            break;
        case "document":
            command = getDocumentMessageString(msg);
            break;
        case "photo":
            command = getPhotoMessageString(msg);
            break;

        default:
            break;
    }

    writeDebug("sendMessage", command);

    runShellCommand(command, {
        captureOutput: true,
        captureErrorOutput: true,
        exitCallback: function (exitCode, capturedOutput, capturedErrorOutput) {
            if (exitCode === 0) {
                writeDebug("sendMessage/runShellCommand", "exitCode: {} | capturedOutput:{}".format(
                    exitCode,
                    capturedOutput
                ));
            } else {
                writeLog("[sendMessage/runShellCommand] exitCode: {} | capturedOutput:{} | capturedErrorOutput:{} \n|→ command: {}".format(
                    exitCode,
                    capturedOutput,
                    capturedErrorOutput,
                    command
                ));
                sendMessage(genErrorMessage(msg, exitCode))
            }
        }
    });
}

function sendRawMessage(rawMsg) {

    command = '{} {}/bot{}/{} {}'.format(
        bot.curlCommand,
        bot.urlServer,
        bot.token,
        rawMsg["method"],
        prepareRawMsg(rawMsg)
    );

    writeDebug("sendRawMessage", command);

    runShellCommand(command, {
        captureOutput: true,
        captureErrorOutput: true,
        exitCallback: function (exitCode, capturedOutput, capturedErrorOutput) {
            if (exitCode === 0) {
                writeDebug("sendRawMessage/runShellCommand", "exitCode: {} | capturedOutput:{}".format(
                    exitCode,
                    capturedOutput
                ));
            } else {
                writeLog("[sendRawMessage/runShellCommand] exitCode: {} | capturedOutput:{} | capturedErrorOutput:{} \n|→ command: {}".format(
                    exitCode,
                    capturedOutput,
                    capturedErrorOutput,
                    command
                ));
            }
        }
    });
}

function prepareRawMsg(rawMsg) {
    result = "";
    for (var key in rawMsg) {
        if (rawMsg.hasOwnProperty(key)) {
            value = rawMsg[key];

            if (typeof (value) === "object") {
                value = JSON.stringify(value);
            }

            if (key != "method") {
                result += "-d {}={} ".format(key, value)
            }
        }
    }
    return result;
}

function pushCommand(chatId, chatType, mentions, messageId, command, args) {
    writeDebug("pushCommand", "chatId: {}, chatType: {}, mentions: {}, messageId: {}, command: {}, args: {}".format(
        chatId,
        chatType,
        mentions,
        messageId,
        command,
        args)
    )
    cmd = {
        chatId: chatId,
        chatType: chatType,
        mentions: mentions,
        messageId: messageId,
        command: command,
        args: args
    }
    count = session.commandsQueue.push(cmd);
    writeDebug("pushCommand", count);
}

function pushCallback(chatId, data, chatType, messageId) {
    writeDebug("pushCallback", "chatId: {}, chatType: {}, messageId: {}, data: {}".format(
        chatId,
        data,
        chatType,
        messageId
    )
    )
    callback = {
        chatId: chatId,
        data: data,
        chatType: chatType,
        messageId: messageId
    }
    count = session.callbacksQueue.push(callback);
    writeDebug("pushCallback", count);
}

function writeDebug(who, text) {
    if (session.isDebugMode()) {
        writeLog("[{}] \n |→ {}".format(who, text));
    }
}

function writeLog(text) {
    log("{}: {}", bot.deviceName, text);
}

function writeMqttCmd() {
    queue = session.commandsQueue;
    cmdValue = dev[bot.deviceName][bot.mqttCmd];

    if (cmdValue.length === 2 && queue.length > 0) {
        cmd = JSON.stringify(queue.shift());
        writeDebug("writeMqttCmd", "I write the command to the {}/{}:\n{}".format(bot.deviceName, bot.mqttCmd, cmd));
        dev[bot.deviceName][bot.mqttCmd] = cmd;
    }
}

function writeMqttCallback() {
    queue = session.callbacksQueue;
    callbackValue = dev[bot.deviceName][bot.mqttCallback];

    if (callbackValue.length === 2 && queue.length > 0) {
        callback = JSON.stringify(queue.shift());
        writeDebug("writeMqttCallback", "I write the callback to the {}/{}:\n{}".format(bot.deviceName, bot.mqttCallback, callback));
        dev[bot.deviceName][bot.mqttCallback] = callback;
    }
}

function isValidUser(userName) {
    return (bot.users.indexOf(userName) != -1);
}

function getParsedMeInfo(jsonString) {
    reply = JSON.parse(jsonString);
    result = reply["result"];
    session.username = "@{}".format(result["username"]);
    botInfo = "";

    botInfo += "\n|→ Bot info:";
    botInfo += "\n| first_name: {}".format(result["first_name"]);
    botInfo += "\n| username: {}".format(session.username);

    return botInfo;
}

function parseMessage(msg) {
    mentions = [];
    command = "";
    args = "";
    chatId = msg["chat"]["id"];

    if (resultType != "my_chat_member" && resultType != "old_chat_member") {
        chatType = msg["chat"]["type"];
        text = msg["text"];
        entities = msg["entities"];
        messageId = msg["message_id"];

        for (item in entities) {
            entity = entities[item];

            if (entity["type"] === "mention") {
                offset = entity["offset"];
                length = entity["length"];
                mentions.push(text.slice(offset, offset + length));
            }

            if (entity["type"] === "bot_command") {
                offset = entity["offset"];
                length = entity["length"];

                command = text.slice(offset, offset + length);

                //check case when bot name is in the command and not in the entity
                usernamePos = command.indexOf(session.username);
                if (usernamePos != -1) {
                    mentions.push(command.match(/@(.*?).+/)[0].trim());
                    command = command.slice(0, usernamePos);;
                }

                args = getCommandArgs(text.slice(offset + length, text.length));
                pushCommand(chatId, chatType, mentions, messageId, command, args);
            }
        };

        if (entities === undefined && chatType === "private") {
            pushCommand(chatId, chatType, mentions, messageId, text, "");
        }
    }
}

function parseCallback(callback) {
    chatId = callback["from"]["id"];
    data = callback["data"];

    if (callback.message != undefined) {
        chatType = callback["message"]["chat"]["type"];
        messageId = callback["message"]["message_id"];
    }

    pushCallback(chatId, data, chatType, messageId);
}

function parseUpdates(jsonString) {
    reply = JSON.parse(jsonString);
    results = reply["result"];

    for (key in results) {
        resultItem = results[key];
        session.lastReadUpdateId = resultItem["update_id"];
        resultType = getResultType(resultItem);
        writeDebug("parseUpdates", "resultType: {}".format(resultType));

        msg = resultItem[resultType];
        userName = msg["from"]["username"];

        if (isValidUser(userName)) {
            switch (resultType) {
                case "message":
                case "edited_message":
                case "my_chat_member":
                    parseMessage(msg);
                    break;
                case "callback_query":
                    parseCallback(msg);
                    break;

                default:
                    break;
            }
        }
    }
}


exports.init = function (token, users, deviceName, deviceTitle) {
    init(token, users, deviceName, deviceTitle);
};

exports.parseMode = bot.parseMode;
exports.pollInterval = bot.pollInterval;
exports.mqttCmd = bot.mqttCmd;
exports.mqttCallback = bot.mqttCallback;
exports.mqttMsg = bot.mqttMsg;
exports.mqttRawMsg = bot.mqttRawMsg;
exports.getUserName = function () {
    return session.username;
}
