import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import fs from "fs";
import path from "path";
//@ts-expect-error cant be fucked writing types for this
import converter from "@hckrnews/ppt2pdf";

import { certDataProcessed, Rank } from "./types";
import { makeid } from "./utility";
import { execSync } from "child_process";
type rank = {
  [key in Rank]: string;
};
const ranks: rank = {
  PTE: "Private",
  PTEP: "Private Proficient",
  PTEL: "Leading Private",
  PTES: "Senior Private",
  PTESL: "Senior Leading Private",
  SAP: "Sapper",
  SAPP: "Sapper Proficient",
  SAPL: "Leading Sapper",
  SAPS: "Senior Sapper",
  SAPSL: "Senior Leading Sapper",
  GNR: "Gunner",
  GNRP: "Gunner Proficient",
  GNRL: "Leading Gunner",
  GNRS: "Senior Gunner",
  GNRSL: "Senior Leading Gunner",
  TPR: "Trooper",
  TPRP: "Trooper Proficient",
  TPRL: "Leading Trooper",
  TPRS: "Senior Trooper",
  TPRSL: "Senior Leading Trooper",
  LCPLJ: "Junior Lance Corporal",
  LCPL: "Lance Corporal",
  LCPLP: "Lance Corporal Proficient",
  LCPLL: "Leading Lance Corporal",
  LCPLS: "Senior Lance Corporal",
  LBDRJ: "Junior Lance Bombardier",
  LBDR: "Lance Bombardier",
  LBDRP: "Bombardier Proficient",
  LBDRL: "Leading Bombardier",
  LBDRS: "Senior Bombardier",
  LCPLJV: "Junior Lance Corporal",
  LCPLV: "Lance Corporal",
  LCPLVP: "Lance Corporal Proficient",
  LCPLVL: "Leading Lance Corporal",
  LCPLVS: "Senior Lance Corporal",
  CPLJ: "Junior Corporal",
  CPL: "Corporal",
  CPLP: "Corporal Proficient",
  CPLL: "Leading Corporal",
  CPLS: "Senior Corporal",
  BDRJ: "Junior Bombardier",
  BDR: "Bombardier",
  BDRP: "Bombardier Proficient",
  BDRL: "Leading Bombardier",
  BDRS: "Senior Bombardier",
  CPLJV: "Junior Corporal",
  CPLV: "Corporal",
  CPLVP: "Corporal Proficient",
  CPLVL: "Leading Corporal",
  CPLVS: "Senior Corporal",
  SGT: "Sergeant",
  SSGT: "Staff Sergeant",
  SAM: "Sergeant At Arms",
  SSAM: "Senio Sergeant At Arms",
  PSM: "Platoon Sergeant Major",
  SGTV: "Sergeant",
  SSGTV: "Staff Sergeant",
  SAMV: "Sergeant At Arms",
  SSAMV: "Senior Sergeant At Arms",
  PSMV: "Platoon Sergeant Major",
  OCDT: "Officer Cadet",
  OCDTV: "Officer Cadet",
  WGCDR: "Wing Commander",
  GPCAPT: "Group Captain",
  "2LT": "Second Lieutenant",
  LT: "Lieutenant",
  SLT: "Senior Lieutenant",
  CLT: "Commanding Lieutenant",
  "2LTV": "Second Lieutenant",
  LTV: "Lieutenant",
  SLTV: "Senior Lieutenant",
  CLTV: "Commanding Lieutenant",
  WO2: "Warrant Officer Class Two",
  WO1: "Warrant Officer Class One",
  CSM: "Company Sergeant Major",
  RSM: "Regimental Sergeant Major",
  RSMA: "Regimental Sergeant Major of ASOT",
  SCAPT: "Second Captain",
  CAPT: "Captain",
  MAJ: "Major",
  LTCOL: "Lieutenant Colonel",
  COL: "Colonel",
  BRIG: "Brigadier",
  MAJGEN: "Major General",
  LTGEN: "Lieutenant General",
  GEN: "General",
  CA: "Chief of ASOT",
  AC: "Aircraftsman",
  LAC: "Leading Aircraftsman",
  LM: "Loadmaster",
  SLM: "Senior Loadmaster",
  FSGT: "Flight Sergeant",
  HOCDT: "Officer Cadet",
  POF: "Pilot Officer",
  FOF: "Flying Officer",
  FLT: "Flight Lieutenant",
  SFLT: "Senior Flight Lieutenant",
  FLL: "Flight Leader",
  SQLD: "Squadron Leader",
  WGCP: "Wing Captain",
  WGCO: "Wing Commander",
  GCPT: "Group Captain",
  COM: "Commordore",
  AVM: "Air Vice Marshal",
  HAM: "Air Marshal",
  ACM: "Air Chief Marshal",
  SACM: "Senior Air Chief Marshal",
  SIG: "Signaller",
  SIGP: "Signaller Proficient",
  SIGL: "Leading Signaller",
  SIGS: "Senior Signaller",
  SIGSL: "Senior Leading Signaller",
  GM: "Game Master",
  GMP: "Game Master Proficient",
  GMS: "Senior Game Master",
  GMG: "Grand Game Master",
  GMD: "Distinguished Game Master",
  REC: "Recruit",
  CSMA: "Company Sergeant Major of ASOT",
  SECLTV: "Second Lieutenant of ASOT",
  SECLT: "Second Lieutenant",
  "": "",
};
async function main(data: certDataProcessed, slide: number) {
  // Load the docx file as binary content
  if (!data.type) return;

  if (
    ranks[
      data.name
        .split(" ")[0]
        .replace("(", "")
        .replace(")", "") as keyof typeof ranks
    ] &&
    data.type == "promotion"
  ) {
    data.name =
      ranks[
        data.name
          .split(" ")[0]
          .replace("(", "")
          .replace(")", "") as keyof typeof ranks
      ] +
      " " +
      data.name.split(" ")[1];
  }
  const content = fs.readFileSync(
    path.resolve(
      __dirname,
      data.type == "promotion"
        ? "../templates/Bulk Template.pptx"
        : "../templates/awards.pptx"
    ),
    "binary"
  );

  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  // Render the document (Replace {first_name} by John, {last_name} by Doe, ...)
  doc.render(data);

  const buf = doc.getZip().generate({
    type: "nodebuffer",
    // compression: DEFLATE adds a compression step.
    // For a 50MB output document, expect 500ms additional CPU time
  });

  // buf is a nodejs Buffer, you can either write it to a
  // file or res.send it with express for example.
  fs.writeFileSync(path.resolve(__dirname, "../output.pptx"), buf);
  const id = makeid(4);
  fs.mkdirSync(path.resolve(__dirname, "../certs-" + id));
  const conv = await converter.create({
    file: __dirname + "/../output.pptx",
    output: __dirname + `/../certs-${id}/`,
  });

  await conv.convert();
  const file = fs.readdirSync(path.resolve(__dirname, `../certs-${id}/`));

  // Both HTTP and local paths are supported
  execSync(
    `convert -density 100  ${path.resolve(__dirname, `../certs-${id}/${file[0]}`)}[${slide}] ${path.resolve(__dirname, `../certs-${id}/output.png`)}`
  );
  return id;
}
export default main;
