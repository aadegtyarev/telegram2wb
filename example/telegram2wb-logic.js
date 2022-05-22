var bot = require("telegram2wb");

token = ""; // Укажите токен бота, можно узнать у @BotFather
allowUsers = ["username"]; // Пользователи, которым разрешено общаться с ботом
deviceName = "telegram2wb";
cmdTopic = "{}/{}".format(deviceName, bot.mqttCmd);
msgTopic = "{}/{}".format(deviceName, bot.mqttMsg);
rawMsgTopic = "{}/{}".format(deviceName, bot.mqttRawMsg);
callbackTopic = "{}/{}".format(deviceName, bot.mqttCallback);

bot.init(token, allowUsers, deviceName);

defineRule("bot_cmd_controller", {
    whenChanged: cmdTopic,
    then: function (newValue, devName, cellName) {

        cmd = JSON.parse(newValue);
        dev[devName][cellName] = "{}";

        if (!isEmptyJson(cmd)) { // Проверяем, что команда не пустая
            botname = bot.getUserName();

            // Если сообщение групповое, то проверяем адресата. Если адресовано не нам, то игнорируем.
            if (cmd.chatType === "group"
                && cmd.mentions.indexOf(bot.getUserName()) === -1) {
                return;
            }

            switch (cmd.command) {
                case "/start":
                case "/help":
                    cmdHelp(cmd)
                    break;
                case "/getfile":
                    cmdGetFile(cmd)
                    break;
                case "/cputemp":
                    cmdCPUTemp(cmd)
                    break;
                case "/kbd":                
                    cmdKbd(cmd)
                    break;
                case "/kbd":                
                    cmdKbd(cmd)
                    break;
                case "Inline keyboard":   
                    cmdInlineKeyboard(cmd)
                    break;              
                case "Close keyboard": 
                    cmdCloseKeyboard(cmd)
                    break;
                default:
                    cmdUnknown(cmd);
                    break;
            }
        }
    }
});

defineRule("bot_callback_controller", {
    whenChanged: callbackTopic,
    then: function (newValue, devName, cellName) {

        callback = JSON.parse(newValue);
        dev[devName][cellName] = "{}";
       
        switch (callback.data) {
            case "cpuTemp":
                cmdCPUTemp(callback)
                break;

            case "kbdInlineClose":
                cmdInlineKeyboardClose(callback)
                break;
        
            default:
                break;
        }

    }
});

function cmdHelp(cmd) {
    text = "Привет, я бот контроллера Wiren Board \nЯ знаю команды:\n"
    text += "/start или /help — справка\n"
    text += '/getfile "/path/filename.txt" — пришлю указанный файл\n'
    text += '/cputemp — температура процессора\n'
    text += '/kbd — клавиатура\n'

    sendMsg(cmd.chatId, text, cmd.messageId);
}

function cmdUnknown(cmd) {
    text = "Я не знаю команду `{}`. \n".format(cmd.command);
    text += "Список команд смотрите в справке: /help";
    sendMsg(cmd.chatId, text, cmd.messageId);
}

function cmdGetFile(cmd) {
    text = "Запрошенный файл";
    sendDoc(cmd.chatId, text, cmd.messageId, cmd.args);
}

function cmdCPUTemp(cmd) {
    text = "CPU Temperature: {}".format(dev["hwmon/CPU Temperature"]);
    sendMsg(cmd.chatId, text, cmd.messageId);
}

/* Примеры клавиатур */
function cmdKbd(cmd) {
    text = "Клавиатура";

    cmdKbdCustom(cmd);    
}

function cmdKbdCustom(cmd) {
    text = "Клавиатура под полем ввода";
    kbdCode = {
        keyboard: [
            ["/cputemp"],
            ["Inline keyboard"],
            ["Close keyboard"]],
        "resize_keyboard": true,
        "one_time_keyboard": true
    };

    sendKbd(cmd.chatId, text, cmd.messageId, JSON.stringify(kbdCode));
}

function cmdCloseKeyboard(cmd) {
    text = "Закрыл клавиатуру";
    kbdCode = {
        keyboard: [],
        'remove_keyboard': true
    };

    sendKbd(cmd.chatId, text, cmd.messageId, JSON.stringify(kbdCode));
}

function cmdInlineKeyboard(cmd) {
    text = "Клавиатура в чате";
    kbdCode = {
        "inline_keyboard": [[
            { "text": "Температура процессора", "callback_data": "cpuTemp" },
            { "text": "Закрыть клавиатуру", "callback_data": "kbdInlineClose" }
        ]],
        "resize_keyboard": true,
        "one_time_keyboard": true
    };

    sendKbd(cmd.chatId, text, cmd.messageId, JSON.stringify(kbdCode));
}

function cmdInlineKeyboardClose(cmd) {

    rawMsg = {
        "method": "deleteMessage",
        "chat_id": cmd.chatId,
        'message_id': cmd.messageId
    };
    
    sendRawMsg(rawMsg);
}

/* Отправка сообщений, документов и клавиатур */
function sendMsg(chatId, text, replyTo) {
    log("{} {} {}", chatId, text, replyTo)
    msg = {
        chatId: chatId,
        text: text,
        messageId: replyTo
    }

    writeMsgToMqtt(msg);
}

function sendRawMsg(rawMsg) {
    log("{}", rawMsg)

    writeRawMsgToMqtt(rawMsg);
}

function sendDoc(chatId, text, replyTo, document) {
    msg = {
        chatId: chatId,
        messageId: replyTo,
        text: text,
        document: document
    }

    writeMsgToMqtt(msg);
}

function sendKbd(chatId, text, replyTo, kbdCode) {
    log("{} {} {} {}", chatId, text, replyTo, kbdCode)
    msg = {
        chatId: chatId,
        text: text,
        messageId: replyTo,
        replyMarkup: kbdCode
    }

    writeMsgToMqtt(msg);
}

/* Прочее */
function isEmptyJson(jsonString) {
    return !Object.keys(jsonString).length;
}

function writeMsgToMqtt(msg) {
    dev[msgTopic] = JSON.stringify(msg);
}

function writeRawMsgToMqtt(rawMsg) {
    dev[rawMsgTopic] = JSON.stringify(rawMsg);
}