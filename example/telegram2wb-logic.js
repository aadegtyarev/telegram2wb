defineRule("bot_controller", {
    asSoonAs: function () {
        return dev["telegram2wb/Cmd"];
    },
    then: function () {
        cmd = getCmd();

        switch (cmd.command) {
            case "/start":
            case "/help":
                cmdHelp(cmd)
                break;
            case "/getfile":
                cmdGetFile(cmd)
                break;
            default:
                cmdUnknown(cmd);
                break;
        }

    }
});

function cmdHelp(cmd, isStart) {
    text = "Привет, я бот контроллера Wiren Board \nЯ знаю команды:\n"
    text += "/start или /help — пришлю эту справку\n"
    text += '/getfile "/path/filename.txt" — пришлю файл `/path/filename.txt`'

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

function getCmd() {
    jsonString = dev["telegram2wb/Cmd"];
    dev["telegram2wb/Cmd"] = "";
    return JSON.parse(jsonString);
}

function sendMsg(chatId, text, replyTo) {
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

function writeMsgToMqtt(msg) {
    dev["telegram2wb/Msg"] = JSON.stringify(msg);
}