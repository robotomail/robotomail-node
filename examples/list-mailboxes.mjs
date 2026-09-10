import { Robotomail } from "@robotomail/sdk";

const mail = new Robotomail(); // reads ROBOTOMAIL_API_KEY
const { mailboxes } = await mail.listMailboxes();
console.log(mailboxes.map(box => box.fullAddress));
