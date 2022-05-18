var bot = require("telegram2wb");

token = "2067631944:AAHFc9uivuKnvdYmH9layC1TtDE1MM6da-c"; // Укажите токен бота, можно узнать у @BotFather
allowUsers = ["degtyarev_a"]; // Пользователи, которым разрешено общаться с ботом
deviceName = "telegram2wb";
cmdTopic = "{}/{}".format(deviceName, bot.mqttCmd);
msgTopic = "{}/{}".format(deviceName, bot.mqttMsg);

bot.init(token, allowUsers, deviceName);

defineRule("bot_controller", {
    whenChanged: cmdTopic,
    then: function (newValue, devName, cellName) {

        cmd = getCmd();

        if (!isEmptyCmd(cmd)) { // Проверяем, что команда не пустая
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
                default:
                    cmdUnknown(cmd);
                    break;
            }
        }
    }
});

function cmdHelp(cmd) {
    text = "Привет, я бот контроллера Wiren Board \nЯ знаю команды:\n"
    text += "/start или /help — пришлю эту справку\n"
    text += '/getfile "/path/filename.txt" — пришлю указанный файл\n'
    text += '/cputemp — пришлю температуру процессора'

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

function cmdKbd(cmd) {
    text = "Клавиатура";
    switch (cmd.args) {
        case "inline":
            cmdKbdCustom(cmd);
            break;

        case "inline clear":
            cmdKbdEmpty(cmd);
            break;

        default:
            cmdUnknown(cmd);
            break;
    }
}

function cmdKbdCustom(cmd) {
    text = "Клавиатура";
    kbdCode = {
        keyboard: [
            ['HELP'],
            ['CPUTEMP']],
        'resize_keyboard': true,
        'one_time_keyboard': true
    };

    sendKbd(cmd.chatId, text, cmd.messageId, JSON.stringify(kbdCode));
}

function cmdKbdEmpty(cmd) {
    text = "Удалил клавиатуру";
    kbdCode = {
        keyboard: [],
        'remove_keyboard': true
    };

    sendKbd(cmd.chatId, text, cmd.messageId, JSON.stringify(kbdCode));
}

function getCmd() {
    jsonString = dev[cmdTopic];
    dev[cmdTopic] = "{}";
    return JSON.parse(jsonString);
}

function isEmptyCmd(cmd) {
    return !Object.keys(cmd).length;
}

function sendMsg(chatId, text, replyTo) {
    log("{} {} {}", chatId, text, replyTo)
    msg = {
        chatId: chatId,
        text: text,
        messageId: replyTo
    }

    writeMsgToMqtt(msg);
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

function writeMsgToMqtt(msg) {
    dev[msgTopic] = JSON.stringify(msg);
}
