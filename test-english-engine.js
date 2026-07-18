import { correctEnglishText } from "./english-engine.js";

const cases = [
  ["I have went home yesterday.", "I went home yesterday."],
  ["I has went home yesterday.", "I went home yesterday."],
  ["Their is alot of work to do.", "There is a lot of work to do."],
  ["She don't like apples.", "She doesn't like apples."],
  ["She dont likes apples.", "She doesn't like apples."],
  ["We was waiting for the bus.", "We were waiting for the bus."],
  ["This are the documents I need.", "These are the documents I need."],
  ["I could of called you sooner.", "I could have called you sooner."],
  ["The new policies would comes into effect.", "The new policies would come into effect."],
  ["He go to school every day.", "He goes to school every day."],
  ["They goes to work early.", "They go to work early."],
  ["These is my book.", "This is my book."],
  ["That are my shoes.", "Those are my shoes."],
  ["These is my books.", "These are my books."],
  ["Those is my shoes.", "Those are my shoes."],
  ["This are my book.", "This is my book."],
  ["That are my shoe.", "That is my shoe."],
  ["This is the news.", "This is the news."],
  ["That is the news.", "That is the news."],
  ["This is the series I like.", "This is the series I like."],
  ["That is the species we studied.", "That is the species we studied."],
  ["This are the important documents.", "This are the important documents."],
  ["This are the mice.", "These are the mice."],
  ["The documents that are ready can be sent.", "The documents that are ready can be sent."],
  ["People that are here can wait.", "People that are here can wait."],
  ["She have finished her work.", "She has finished her work."],
  ["They has arrived.", "They have arrived."],
  ["He did not went there.", "He did not go there."],
  ["Your welcome.", "You're welcome."],
  ["Your welcome package is ready.", "Your welcome package is ready."],
  ["I appreciate your welcome message.", "I appreciate your welcome message."],
  ["Your welcome was warm.", "Your welcome was warm."],
  ["Your welcome to the guests was warm.", "Your welcome to the guests was warm."],
  ["We appreciated your welcome to our team.", "We appreciated your welcome to our team."],
  ["Its a good idea.", "It's a good idea."],
  ["I definately recieved the adress.", "I definitely received the address."],
  ["We need too discuss this.", "We need to discuss this."],
  ["I want to loose weight.", "I want to lose weight."],
  ["I look forward to hear from you.", "I look forward to hearing from you."],
  ["One of the students are absent.", "One of the students is absent."],
  ["Each of the students have a book.", "Each of the students has a book."],
  ["Neither of them are ready.", "Neither of them is ready."],
  ["Your going to like it.", "You're going to like it."],
  ["Your going to college surprised me.", "Your going to college surprised me."],
  ["Your going to London worries me.", "Your going to London worries me."],
  ["There is many reasons.", "There are many reasons."],
  ["Several employee have complained.", "Several employees have complained."],
  ["The managers has announced the change.", "The managers have announced the change."],
  ["The documents contains errors.", "The documents contain errors."],
  ["The informations are incorrect.", "The information is incorrect."],
  ["This dog wagged it tail.", "This dog wagged its tail."],
  ["I saw it tail the car.", "I saw it tail the car."],
  ["Make it tail the suspect.", "Make it tail the suspect."],
  ["My favourite colour is blue.", "My favourite colour is blue."],
  ["The centre was closed after she travelled home.", "The centre was closed after she travelled home."],
  ["I practise every day with an aluminium tool and an aeroplane tyre.", "I practise every day with an aluminium tool and an aeroplane tyre."],
  ["Korr checks English grammar.", "Korr checks English grammar."],
  ["Recieved your email.", "Received your email."],
  ["Definately, we can go.", "Definitely, we can go."],
  ["Étienne sent the report.", "Étienne sent the report."],
  ["François visited Aix-en-Provence.", "François visited Aix-en-Provence."],
  ["Bonjour, this is a test.", "Bonjour, this is a test."],
  ["Merci for your help.", "Merci for your help."],
  ["Bonjour team, the report is ready.", "Bonjour team, the report is ready."],
  ["To whom did you speak?", "To whom did you speak?"],
  ["Whom did you call?", "Whom did you call?"],
  ["I bought apples, oranges and pears.", "I bought apples, oranges and pears."],
  ["They left theyre bags here.", "They left their bags here."],
  ["Were are you?", "Where are you?"],
  ["Your the best.", "You're the best."],
  ["There going to arrive soon.", "They're going to arrive soon."],
  ["I saw people there going to work.", "I saw people there going to work."],
  ["The students there going to class are late.", "The students there going to class are late."],
  ["Their supposed to call us.", "They're supposed to call us."],
  ["Please advice me.", "Please advise me."],
  ["Thank you for the advise.", "Thank you for the advice."],
  ["I don't want to loose money.", "I don't want to lose money."],
  ["A apple is on the table.", "An apple is on the table."],
  ["I seen him yesterday.", "I saw him yesterday."],
  ["YOUR WELCOME!", "YOU'RE WELCOME!"],
  ["THIS ARE IMPORTANT.", "THIS IS IMPORTANT."],
  ["I AM AGREE.", "I AGREE."],
  ["Your going to\nmeet us.", "Your going to\nmeet us."],
  ["This\nare two lines.", "This\nare two lines."],
  ["I look forward to\nhear from you.", "I look forward to\nhear from you."],
  ["The report is ready for review.", "The report is ready for review."],
  ["Please email support@example.com tomorrow.", "Please email support@example.com tomorrow."],
  ["Open https://example.com/docs at 10:30.", "Open https://example.com/docs at 10:30."]
];

let failures = 0;
for (const [input, expected] of cases) {
  const result = await correctEnglishText(input);
  console.log(`${result.durationMs} ms | ${input} -> ${result.text}`);
  if (result.text !== expected) {
    console.error(`Attendu : ${expected}`);
    failures += 1;
  }
}

if (failures) {
  console.error(`${failures} correction(s) anglaise(s) ont échoué.`);
  process.exitCode = 1;
} else {
  console.log(`Corrections anglaises vérifiées : ${cases.length} cas.`);
}
