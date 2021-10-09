/*
Telegram bot on wb-rules
v. 1.0.0
*/

bot = {
    token: "", 								//Bot token can be obtained from @BotFather
    users: ["user_name"], 					// Array of allowed user names: ["user1"] or ["user1", "user2"]
    deviceName: "telegram2wb", 				// Name of the virtual device to be created
    deviceTitle: "Telegram Bot", 			// Virtual device header
    pollIntegval: 1000, 					//ms Interval for receiving messages from the server
    mqttIntegval: 500, 						//ms MQTT-topics verification interval
    urlServer: "https://api.telegram.org", 	// Telegram server name
    mqttCmd: "Cmd", 						// The topic where the bot publishes commands
    mqttMsg: "Msg", 						// The topic from which the bot receives messages to send
    DebugSwitch: "Debug", 					// Debug management topic name
    EnabledSwitch: "Enabled", 				// Name of the state management topic
    parseMode: "Markdown", 					// The type of messages to be sent. Available: Markdown, HTML
}

session = {
    commandsQueue: [], //command, args
    lastReadUpdateId: 0,
    pausePoll: false,
    isDebugMode: function () {
        return getTopicValue(
            bot.deviceName,
            bot.DebugSwitch
        );
    }
}

init();

function init() {
    writeLog("Bot initialization");

    device = defineVirtualDevice(bot.deviceName, {
        title: bot.deviceTitle,
        cells: {}
    });

    device.addControl(bot.EnabledSwitch, { type: "switch", value: true });
    device.addControl(bot.DebugSwitch, { type: "switch", value: false });
    device.addControl(bot.mqttCmd, { type: "text", value: "", readonly: true });
    device.addControl(bot.mqttMsg, { type: "text", value: "", readonly: true });

    writeLog("Virtual device is created");

    defineRule("pollTimerControl", {
        asSoonAs: function () {
            return dev[bot.deviceName][bot.EnabledSwitch];
        },
        then: function () {
            startTicker("pollTimer", bot.pollIntegval);
        }
    });

    defineRule("pollTimer_firing", {
        when: function () { return timers.pollTimer.firing; },
        then: function () {
            if (!session.pausePoll) {
                getMessages();
            }

            if (dev[bot.deviceName][bot.EnabledSwitch] == false) {
                timers.pollTimer.stop();
            }
        }
    });

    defineRule("mqttTimerControl", {
        asSoonAs: function () {
            return dev[bot.deviceName][bot.EnabledSwitch];
        },
        then: function () {
            startTicker("mqttTimer", bot.mqttIntegval);
        }
    });

    defineRule("mqttTimer_firing", {
        when: function () { return timers.mqttTimer.firing; },
        then: function () {
            writeMqttCmd();
        }
    });

    defineRule("mqttMessage ", {
        asSoonAs: function () {
            return dev[bot.deviceName][bot.mqttMsg];
        },
        then: function () {
            jsonString = dev[bot.deviceName][bot.mqttMsg];
            writeDebug("mqttMessage", jsonString);
            dev[bot.deviceName][bot.mqttMsg] = "";

            try {
                msg = JSON.parse(jsonString);
            } catch (error) {
                writeLog("Incorrect message format in MQTT topic: {}".format(error.message));
            }

            sendMessage(msg);
        }
    });

    writeLog("Connecting to the server...");
    checkConnection();
}

function checkConnection() {
    session.pausePoll = true;
    command = 'curl -s -X POST {}/bot{}/getMe'.format(
        bot.urlServer,
        bot.token
    );

    runShellCommand(command, {
        captureOutput: true,
        exitCallback: function (exitCode, capturedOutput) {
            if (exitCode === 0) {
                if (checkConnectStatus(capturedOutput)) {
                    writeLog("Connected to the server.");
                }
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
    command = 'curl -s -X POST {}/bot{}/getUpdates?offset={}'.format(
        bot.urlServer,
        bot.token,
        startUpdateId
    );

    runShellCommand(command, {
        captureOutput: true,
        exitCallback: function (exitCode, capturedOutput) {
            if (exitCode === 0) {
                if (checkConnectStatus(capturedOutput)) {
                    writeDebug("getMessages",capturedOutput);
                    parseUpdates(capturedOutput);
                }
                session.pausePoll = false;
                return;
            }
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

    return type;
}

function getCommandArgs(text, startPos) {
    result = text.match(/"(.*?)"/);

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

    var params = "-d chat_id={} -d text='{}' -d parse_mode={} ".format(chatId, getPreparedText(text), bot.parseMode);
    if (Boolean(replyToMessage)) {
        params += "-d reply_to_message_id={} ".format(replyToMessage);
    }

    return 'curl -s -X POST {}/bot{}/sendMessage {}'.format(
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

    return 'curl -s -X POST {}/bot{}/sendDocument {}'.format(
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

function pushCommand(chatId, messageId, command, args) {
    writeDebug("pushCommand", "chatId: {}, messageId: {}, command: {}, args: {}".format(
        chatId,
        messageId,
        command,
        args)
    )
    cmd = {
        chatId: chatId,
        messageId: messageId,
        command: command,
        args: args
    }
    count = session.commandsQueue.push(cmd);
    writeDebug("pushCommand", count);
}

function setTopicValue(deviceName, topicName, newValue) {
    return getDevice(deviceName).getControl(topicName).setValue(newValue)
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

    if (!Boolean(dev[bot.deviceName][bot.mqttCmd]) && queue.length > 0) {
        cmd = JSON.stringify(queue.shift());
        writeDebug("writeMqttCmd", "I write the command to the {}/{}:\n{}".format(bot.deviceName, bot.mqttCmd, cmd));
        dev[bot.deviceName][bot.mqttCmd] = cmd;
    }
}

function isValidUser(userName) {
    return (bot.users.indexOf(userName) != -1);
}

function parseUpdates(jsonString) {
    reply = JSON.parse(jsonString);

    results = reply["result"];

    for (key in results) {
        resultItem = results[key];
        session.lastReadUpdateId = resultItem["update_id"];
        resultType = getResultType(resultItem);
        msg = resultItem[resultType];
        userName = msg["from"]["username"];

        if (isValidUser(userName)) {
            chatId = msg["chat"]["id"];

            if (resultType != "my_chat_member") {
                text = msg["text"];
                entities = msg["entities"];
                messageId = msg["message_id"];

                for (item in entities) {
                    entity = entities[item];

                    if (entity["type"] === "bot_command") {
                        cmdStart = entity["offset"];
                        cmdEnd = cmdStart + entity["length"];

                        command = text.slice(cmdStart, cmdEnd);
                        pushCommand(chatId, messageId, command, getCommandArgs(text, cmdEnd));
                    }
                }

            }
        }

    }
}