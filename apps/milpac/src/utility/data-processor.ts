import {
  uniformDataRaw,
  certDataRaw,
  certDataProcessed,
  boxDataRaw,
  Citation,
  Rank,
  Certificate,
} from "../types";
type CampaignMap = {
  [key: string]: Citation;
};
const campaignMap: CampaignMap = {
  Campaign: "campaign",
  "Campaign First Clasp": "campaign1",
  "Campaign Second Clasp": "campaign2",
  "Campaign Third Clasp": "campaign3",
  "Campaign Fourth Clasp": "campaign4",
  "Campaign Tier Two First Clasp": "campaign5",
  "Campaign Tier Two Second Clasp": "campaign6",
  "Campaign Tier Two Third Clasp": "campaign7",
  "Campaign Tier Two Fourth Clasp": "campaign8",
  "Campaign Tier Three First Clasp": "campaign9",
  "Campaign Tier Three Second Clasp": "campaign10",
  "Campaign Tier Three Third Clasp": "campaign11",
  "Campaign Tier Three Fourth Clasp": "campaign12",
  "Campaign Tier Four First Clasp": "campaign13",
  "Campaign Tier Four Second Clasp": "campaign14",
  "Campaign Tier Four Third Clasp": "campaign15",
  "Campaign Tier Four Fourth Clasp": "campaign16",
};

function sanitize_uniform(data: uniformDataRaw) {
  const citations = data.citations;
  const sanitizedData = data;
  sanitizedData.citations = [];
  citations.forEach((citation) => {
    const sanitizedCitation = campaignMap[citation as keyof typeof campaignMap];
    if (sanitizedCitation)
      sanitizedData.citations.push(sanitizedCitation as Citation);
    else
      sanitizedData.citations.push(
        citation.toLowerCase().replace(/\s/g, "") as Citation
      );
  });
  let clasps: number[] = [];
  citations.forEach((citation) => {
    if (citation.startsWith("campaign")) {
      //if they have campaiign2 and campaign1 remove campaign1 , baisically only keep the highest tier
      const clasp = citation.substring(8);
      const claspNumber = parseInt(clasp);
      clasps.push(claspNumber);
    }
  });
  if (clasps.length > 1) {
    clasps = clasps.filter((x) => !isNaN(x));
    if (clasps.length !== 0) {
      const maxClasp = Math.max(...clasps);
      const maxClaspString = "campaign" + maxClasp;
      sanitizedData.citations = sanitizedData.citations.filter(
        (x) => !x.startsWith("campaign")
      );
      sanitizedData.citations.push(maxClaspString as Citation);
    }
  }
  if (data.TrainingMedals) {
    for (const earnedMedal of data.TrainingMedals) {
      if (earnedMedal.startsWith("Exp")) {
        const AdvMedal = earnedMedal.replace("Exp", "Adv");
        const basicMedal = earnedMedal.replace("Exp", "B");
        //remove adv medal and basic medal if present from medals array
        const index = data.TrainingMedals.findIndex(
          (medal) => medal === `${AdvMedal}`
        );
        if (index !== -1) {
          sanitizedData.TrainingMedals.splice(index, 1);
        }
        const basicIndex = data.TrainingMedals.findIndex(
          (medal) => medal === `${basicMedal}`
        );
        if (basicIndex !== -1) {
          sanitizedData.TrainingMedals.splice(basicIndex, 1);
        }
      } else if (earnedMedal.startsWith("Adv")) {
        const expertMedal = earnedMedal.replace("Adv", "Exp");
        const basicMedal = earnedMedal.replace("Adv", "B");
        //remove adv medal and basic medal if present from medals array
        const index = data.TrainingMedals.findIndex(
          (medal) => medal === `${expertMedal}`
        );
        if (index !== -1) {
          sanitizedData.TrainingMedals.splice(index, 1);
        }
        const basicIndex = data.TrainingMedals.findIndex(
          (medal) => medal === `${basicMedal}`
        );
        if (basicIndex !== -1) {
          sanitizedData.TrainingMedals.splice(basicIndex, 1);
        }
      }
    }
  }
  if (data.medallions) {
    sanitizedData.medallions = data.medallions.filter((x) => x != "");
  }
  let intrank = data.rank; //use for rifleman badge processing
  intrank = data.rank
    .replace("SIG", "PTE")
    .replace("TPR", "PTE")
    .replace("SAP", "PTE")
    .replace("PTSG", "PSM")
    .replace("GNR", "PTE") as Rank;
  data.rank = intrank;
  if (intrank === ("PTEP" as Rank)) {
    data.RifleManBadge = "PTEP";
    data.rank = "";
  } else if (intrank === ("PTE" as Rank)) {
    data.RifleManBadge = "PTE";
    data.rank = "";
  } else if (intrank === ("REC" as Rank)) {
    data.RifleManBadge = "";
    data.rank = "";
  }
  return sanitizedData;
}

function sanitize_certificate(data: certDataRaw): certDataProcessed {
  console.log("Sanitizing certificate data:", data);
  const cert = data.cert;
  const sanitizedData = data as certDataProcessed;
  sanitizedData.signaturerRankShort = process.env.SIGNATURER_SHORT_RANK!;
  sanitizedData.signaturerRankFull = process.env.SIGNATURE_RANK!;
  sanitizedData.signaturer = process.env.SIGNATURER!;
  if (data.type === "award" && sanitizedData.cert.startsWith("Campaign"))
    sanitizedData.cert = campaignMap[cert as keyof typeof campaignMap];
  else if (data.type === "award")
    sanitizedData.cert = cert.toLowerCase().replace(/\s/g, "") as Certificate;

  if (data.type === "award") {
    if (sanitizedData.cert.startsWith("bronze")) {
      sanitizedData.cert = "bronzemedallion";
    }
    if (sanitizedData.cert.startsWith("silver")) {
      sanitizedData.cert = "silvermedallion";
    }
    if (sanitizedData.cert.startsWith("gold")) {
      sanitizedData.cert = "goldmedallion";
    }
  }
  console.log("Sanitized certificate data:", sanitizedData);
  return sanitizedData;
}

function sanitize_box(data: boxDataRaw) {
  const sanitizedData = data;
  sanitizedData.medals = data.medals.map((x) => {
    if (x.startsWith("Campaign")) {
      return campaignMap[x as keyof typeof campaignMap];
    }
    return x.toLowerCase().replace(/\s/g, "");
  });
  return sanitizedData;
}
export { sanitize_uniform, sanitize_certificate, sanitize_box };

sanitize_certificate({
  name: "John Doe",
  signaturer: "Jane Smith",
  jddate: "2023-01-01",
  jdsuffix: "A1",
  jdnum: "12345",
  dateNumber: "001",
  date: "2023-01-01",
  suffix: "A1",
  cert: "Protagonist",
  type: "award",
} as unknown as certDataRaw);
