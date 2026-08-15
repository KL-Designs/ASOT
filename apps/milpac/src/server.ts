import express from "express";
import { randomBytes } from "crypto";
import bodyParser from "body-parser";
import path from "path";
import fs from "fs";
import { rimraf } from "rimraf";
import passportLocal from "passport-local";
import cookieParser from "cookie-parser";
import passport from "passport";
import MongoStore from "connect-mongo";
import dotenv from "dotenv-safe";
import mongoose from "mongoose";
import { certDataRaw } from "./types";
import imageGenerator from "./index";
import certGenerator from "./cert";
import generate_box from "./box";
import DB from "./connectDB";
import userDataModel from "./models/userData";
import { Request, Response } from "express";
import getUCID from "./utility/get-uc-id";
import cors from "cors";
dotenv.config();

const app = express();
const port = 42070;

const jsonParser = bodyParser.json();
const LocalStrategy = passportLocal.Strategy;

app.use(cors());

// Your application logic

//might use it in the feautre
console.log(__dirname);
app.use(express.static(path.resolve(__dirname, "../public/assets")));

//PASSPORT SETUP

app.set("trust proxy", "loopback");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
import expressSession from "express-session";
const session = expressSession({
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URL }),
  secret: process.env.SESSION_SECRET || randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 },
});
app.use(session);
app.use(passport.initialize());
app.use(passport.session());

import Account from "./models/account";
import {
  sanitize_uniform,
  sanitize_certificate,
  sanitize_box,
} from "./utility/data-processor";
import { updateUCUniform } from "./utility/update-uc-uniform";
passport.use(new LocalStrategy(Account.authenticate()));
passport.serializeUser(Account.serializeUser());
passport.deserializeUser(Account.deserializeUser());

(async () => {
  await DB();
})();
mongoose.connection.on("open", () => {
  console.log("Connected to MongoDB");
});
mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

// create application/x-www-form-urlencoded parser

app.get("/", (req, res) => {
  //check if user is logged in
  if (req.isAuthenticated())
    res.sendFile(path.resolve(__dirname, "../public/index.html"));
  else res.redirect("/login");
});

app.get("/login", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../public/login.html"));
});

app.post("/login", passport.authenticate("local"), function (req, res) {
  res.redirect("/");
});

app.get("/register", (req: Request, res: Response) => {
  if (!req.headers.host) {
    res.status(400).send("NO HOST");
    return;
  }
  const hostmachine = req.headers.host.split(":")[0];
  if (hostmachine != "localhost") {
    res.status(400).send("OI CUNT, GTFO");
    return;
  }
  res.sendFile(path.resolve(__dirname + "../public/register.html"));
});

app.post("/register", function (req, res) {
  if (!req.headers.host) {
    res.status(400).send("NO HOST");
    return;
  }
  const hostmachine = req.headers.host.split(":")[0];
  if (hostmachine != "localhost") {
    res.status(400).send("OI CUNT, GTFO");
    return;
  }
  Account.register(
    new Account({ username: req.body.username }),
    req.body.password,
    function () {
      passport.authenticate("local")(req, res, function () {
        res.redirect("/");
      });
    }
  );
});

app.get("/data", (req, res) => {
  //read headers
  userDataModel
    .findOne({ name: req.headers.name })
    .then((data) => {
      res.send(data);
    })
    .catch((err) => {
      res.status(500).send(err);
    });
});
app.get("/cert-poll", (req, res) => {
  //TODO: Fix this functionality

  const files: unknown[] = [];

  try {
    //  files = fs.readdirSync(path.resolve(__dirname, "../certs"));
  } catch (err) {
    throw new Error(err as string);
  }
  res.send({ files: files });
});
app.get("/certificates", (req, res) => {
  if (req.isAuthenticated())
    res.sendFile(path.resolve(__dirname, "../public/certificate.html"));
  else res.redirect("/login");
});
app.post("/update", jsonParser, async (req, res) => {
  let data = req.body;
  data = sanitize_uniform(data);
  console.log(data);
  const userID = data.memberID;
  const ucID = await getUCID(userID);
  let errored = false;
  if (!data) {
    res.sendStatus(400);
    return;
  }
  //  if(!data.RifleManBadge || data.RifleManBadge != "PTE" & data.RifleManBadge != "PTE(P)") return res.status(400).send("No Rifleman Badge, or invalid badge");
  //  if(!data.rank) return res.status(400).send("No rank");
  if (!data.Uniform) {
    res.status(400).send("No uniform");
    return;
  }
  if (!data.name) {
    res.status(400).send("No name");
    return;
  }

  await imageGenerator(data).catch((err) => {
    console.log("error caught");
    errored = true;
    console.log(JSON.stringify(err, Object.getOwnPropertyNames(err)));
    res.status(500).send(JSON.stringify(err, Object.getOwnPropertyNames(err)));
  });
  if (errored) return;
  res
    .status(200)
    .sendFile(path.resolve(__dirname + `/../milpac/${data.name}.png`));

  const file = fs.readFileSync(
    path.resolve(__dirname + `/../milpac/${data.name}.png`)
  );
  //convert file to ArrayBuffer
  const buffer = Buffer.from(file);
  if (!ucID) return;
  await updateUCUniform(ucID, buffer);
});
app.post("/create-cert", jsonParser, async (req, res) => {
  const data = sanitize_certificate(req.body as certDataRaw);
  if (!data) {
    res.sendStatus(400);
    return;
  }
  const SlideNumbers = {
    ENLIST: "1",
    RETURN: "2",
    PTE: "3",
    PTEP: "4",
    PTEL: "5",
    PTES: "6",
    PTESL: "7",
    SAP: "8",
    SAPP: "9",
    SAPL: "10",
    SAPS: "11",
    SAPSL: "12",
    GNR: "13",
    GNRP: "14",
    GNRL: "15",
    GNRS: "16",
    GNRSL: "17",
    TPR: "18",
    TPRP: "19",
    TPRL: "20",
    TPRS: "21",
    TPRSL: "22",
    LCPLJ: "23",
    LCPL: "24",
    LCPLP: "25",
    LCPLL: "26",
    LCPLS: "27",
    LBDRJ: "28",
    LBDR: "29",
    LBDRP: "30",
    LBDRL: "31",
    LBDRS: "32",
    LCPLVJ: "33",
    LCPLV: "34",
    LCPLVP: "35",
    LCPLVL: "36",
    LCPLVS: "37",
    CPLJ: "38",
    CPL: "39",
    CPLP: "40",
    CPLL: "41",
    CPLS: "42",
    BDRJ: "43",
    BDR: "44",
    BDRP: "45",
    BDRL: "46",
    BDRS: "47",
    CPLVJ: "48",
    CPLV: "49",
    CPLVP: "50",
    CPLVL: "51",
    CPLVS: "52",
    SGT: "53",
    SSGT: "54",
    SAM: "55",
    SSAM: "56",
    PSM: "57",
    PTSG: "57", //same as PSM
    SGTV: "58",
    SSGTV: "59",
    SAMV: "60",
    SSAMV: "61",
    PSMV: "62",
    OCDT: "63",
    "2LT": "64",
    LT: "65",
    SLT: "66",
    CLT: "67",
    "2LTV": "68",
    LTV: "69",
    SLTV: "70",
    CLTV: "71",
    WO2: "72",
    WO1: "73",
    CSM: "74",
    RSM: "75",
    RSMA: "76",
    SCAPT: "77",
    CAPT: "78",
    MAJ: "79",
    LTCOL: "80",
    COL: "81",
    BRIG: "82",
    MAJGEN: "83",
    LTGEN: "84",
    GEN: "85",
    CA: "86",
    AC: "87",
    LAC: "88",
    LM: "89",
    SLM: "90",
    FSGT: "91",
    HOCDT: "92",
    POF: "93",
    FOF: "94",
    FLT: "95",
    SFLT: "96",
    FLL: "97",
    SQLD: "98",
    WGCP: "99",
    WGCO: "100",
    GCPT: "101",
    COM: "102",
    AVM: "103",
    AM: "104",
    ACM: "105",
    SACM: "106",
    SIG: "107",
    SIGP: "108",
    SIGL: "109",
    SIGS: "110",
    SIGSL: "111",
    GM: "112",
    GMP: "113",
    GMS: "114",
    GMG: "115",
    GMD: "116",
    "1year": 1,
    "2year": 2,
    "3year": 3,
    longterm: 4,
    atlas: 5,
    architect: 6,
    beyond: 7,
    brokenlance: 8,
    valour: 9,
    diplomat: 10,
    founder: 11,
    gallantry: 12,
    groupdevelopment: 13,
    instructor: 14,
    juniorleadership: 15,
    medical: 16,
    protagonist: 17,
    publicrelation: 18,
    rotary: 19,
    seniorleadership: 20,
    bronzemedallion: 21,
    silvermedallion: 22,
    goldmedallion: 23,
    courage: 24,
    watchman: 25,
    campaign: 26,
    campaign1: 27,
    campaign2: 28,
    campaign3: 29,
    campaign4: 30,
    campaign5: 31,
    campaign6: 32,
    campaign7: 33,
    campaign8: 34,
    campaign9: 35,
    campaign10: 36,
    campaign11: 37,
    campaign12: 38,
    campaign13: 39,
    campaign14: 40,
    campaign15: 41,
    campaign16: 42,
  };
  const slide = SlideNumbers[data.cert as keyof typeof SlideNumbers];
  const id = await certGenerator(data, parseInt(slide as string) - 1);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  res
    .status(200)
    .sendFile(path.resolve(__dirname, `../certs-${id}/output.png`));
  //await new Promise((resolve) => setTimeout(resolve, 5000));
  fs.copyFileSync(
    path.resolve(__dirname, `../certs-${id}/output.png`),
    path.resolve(__dirname, `../certificates/${data.name} - ${data.cert}.png`)
  );

  await rimraf(path.resolve(__dirname, `../certs-${id}`)).catch((err) =>
    console.log(err)
  );
  /*
  
  fs.rm(path.resolve(__dirname, "../certs-${}/"), {
    recursive: true, force: true
  },(err) => {  

      if (err) {  

          console.error(err);  

            }  

              else {  

                  console.log("Recursive: Directory Deleted!");  

              }
  
  });
  */
});
app.get("/get-medals", (req, res) => {
  res.send({
    files: fs.readdirSync(
      path.resolve(__dirname, "../medal-box-images/medals")
    ),
  });
});
app.get("/box", (req, res) => {
  if (req.isAuthenticated())
    res.sendFile(path.resolve(__dirname, "../public/box.html"));
  else res.redirect("/login");
});
app.post("/generate-box", jsonParser, async (req, res) => {
  let data = req.body;
  data = sanitize_box(data);
  console.log(data);
  if (!data) {
    res.sendStatus(400);
    return;
  }
  await generate_box(data);
  res
    .status(200)
    .sendFile(
      path.resolve(__dirname, `../medal-box-images/boxes/${data.name}.png`)
    );
});
// if (process.env.NODE_ENV === "production") {
//   var server = https.createServer(options, app);

//   server.listen(port, () => {
//     console.log("server starting on port : " + port);
//   });
// } else {
//   app.listen(port, () => {
//     console.log("dev server starting on port : " + port);
//   });
// }

app.listen(port, () => {
  console.log("server starting on port : " + port);
});
