# telegram2wb-logic

## Описание

Пример работы с ботом telegram2wb.

![chat](./doc/chat.png)

Перед работой мы инициализируем бота:

```javascript
var bot = require("telegram2wb"); // подключаем модуль

token = ""; // Укажите токен бота, можно узнать у @BotFather 
allowUsers = ["username"]; // Пользователи, которым разрешено общаться с ботом

//необязательные для иниациализации переменые, но с ними удобно
deviceName = "telegram2wb"; // Имя создаваемого виртуального устройства
cmdTopic = "{}/{}".format(deviceName, bot.mqttCmd); //путь к топику команд
msgTopic = "{}/{}".format(deviceName, bot.mqttMsg); // путь к топику сообщений

// инициализация бота
bot.init(token, allowUsers, deviceName);
```

После инициализации мы описываем контроллер команд, который следит за топиком, указанным в переменной `cmdTopic` — *telegram2wb/Cmd*:

```javascript
defineRule("bot_controller", {
    asSoonAs: function () {
        return dev[cmdTopic];
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
```

Как только в топике появляется команда, контроллер забирает её, очищает топик и вызывает функцию, которая назначена команде.

Функции, начинающиеся с `cmd` — обработчики команд, которые принимают на вход объект команды *cmd*.

Также в примере есть четыре сервисные функции:

```javascript
getCmd() // забирает из топика команду, очищает топик, парсит полученный JSON и возвращает объект команды
sendMsg(chatId, text, replyTo) // формирует объект msg для отправки текстового сообщения
sendDoc(chatId, text, replyTo, document) // формирует объект msg для отправки файла
writeMsgToMqtt(msg) // преобразует объект msg в JSON и публикует в топике telegram2wb/Msg
```

