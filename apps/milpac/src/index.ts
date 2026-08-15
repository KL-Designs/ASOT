import { createCanvas, loadImage, registerFont } from "canvas";
import fs from "fs";
import { glob } from "glob";
import medalData from "../medals.json";
import { Citation, uniformDataRaw } from "./types";
type medalJSONType = {
  [key: string]: Citation[];
};
const medalJSON = medalData as medalJSONType;
import path from "path";
import userDataModel from "./models/userData";

//@ts-expect-error Just a font import, no functions or anything
import times_new_roman from "@canvas-fonts/times-new-roman";
registerFont(times_new_roman, {
  family: "Times New Roman",
});
/**
 * Generates a military personnel image based on the provided uniform data, saves it to disk, and updates the user data model.
 * @param {uniformDataRaw} data - The uniform data containing user information, medals, badges, and other attributes.
 * @returns {Promise<void>} A promise that resolves when the image has been generated and user data updated.
 */
const main = async (data: uniformDataRaw) => {
  try {
    const canvas = createCanvas(1398, 1000);
    const ctx = canvas.getContext("2d");
    if (data.Uniform == "Brown") {
      const image = await loadImage(__dirname + "/../base-brown-uni.png");
      ctx.drawImage(image, 0, 0, 1398, 1000);
    }
    if (data.Uniform == "Blue") {
      const image = await loadImage(__dirname + "/../blue_base_uni.png");
      ctx.drawImage(image, 0, 0, 1398, 1000);
    }

    //UNIVERSAL STUFF
    //RifleMan Badge

    if (data.RifleManBadge) {
      const RifleManBadge = await loadImage(
        __dirname + `/../imge/Embellishments/${data.RifleManBadge}.png`
      );

      ctx.drawImage(RifleManBadge, 0, 0, 1398, 1000);
    }
    //draw ./imge/Embelishments/Name tag.png
    // const image2 = await loadImage(
    // __dirname + "/../imge/Embelishments/Name Tag.png"
    //);
    //  ctx.drawImage(image2, 351, 477, 210, 57);
    //write name on image2
    ctx.font = "bold 20px Times New Roman";
    //text should be white in colour
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    let size = ctx.measureText(data.name).width;
    let counter = 0;
    while (size > 120) {
      counter++;

      ctx.font = `bold ${20 - counter}px Times New Roman`;
      size = ctx.measureText(data.name).width;
    }
    ctx.fillText(data.name, 475, 512);
    //corp badge
    let corpbadge;
    if (["COL", "LTGEN", "GEN", "MAJGEN", "BRIG"].includes(data.rank)) {
      corpbadge = await loadImage(
        __dirname + `/../imge/Corps/Corps Badges/${data.badge}2.png`
      );
    } else {
      corpbadge = await loadImage(
        __dirname + `/../imge/Corps/Corps Badges/${data.badge}.png`
      );
    }
    ctx.drawImage(corpbadge, 0, 0, 1398, 1000);

    //medallions
    if (
      Array.isArray(data.medallions) &&
      data.medallions.length > 0 &&
      data.medallions[0] !== ""
    ) {
      for (const medallion of data.medallions) {
        const img = await loadImage(
          path.resolve(__dirname, `../imge/Medallions/${medallion}.png`)
        );
        ctx.drawImage(img, 0, 0, 1398, 1000);
      }
    }
    //Training medals
    if (data.TrainingMedals) {
      //read a nested directory and its sub directories and files
      //scan imge/Training Medals and all the folders inside it

      const medals = await glob(
        __dirname + "/../imge/Training Badges/**/*.png",
        {
          absolute: true,
        }
      ).catch((err) => console.log(err));
      if (!medals) throw new Error("No medals found");

      for (const earnedMedal of data.TrainingMedals) {
        // if(earnedMedal == "FO" || earnedMedal == "")
        //
        let names;
        if (process.platform === "win32") {
          names = medals.map((medal) => medal.split("\\").pop());
        } else {
          names = medals.map((medal) => medal.split("/").pop());
        }

        if (!names.includes(`${earnedMedal}.png`)) {
          throw new Error("Training Medal not found " + earnedMedal);
        }

        //load the medal with the path from medals array
        const medal = await loadImage(
          medals[names.indexOf(`${earnedMedal}.png`)]
        );
        ctx.drawImage(medal, 0, 0, 1398, 1000);
      }
    }

    if (data.citations) {
      const EndLine2Y = 511;
      const leftEndFirstLine2X = 1000;
      const firstLineMedals = medalJSON.first_line.filter((x) =>
        data.citations.includes(x)
      );
      const secondLineMedals = medalJSON.second_line.filter((x) =>
        data.citations.includes(x)
      );
      const thirdLineMedals = medalJSON.third_line.filter((x) =>
        data.citations.includes(x)
      );
      const fourthLineMedals = medalJSON.fourth_line.filter((x) =>
        data.citations.includes(x)
      );
      const fifthLineMedals = medalJSON.fifth_line.filter((x) =>
        data.citations.includes(x)
      );
      const sixthLineMedals = medalJSON.sixth_line.filter((x) =>
        data.citations.includes(x)
      );
      const seventhLineMedals = medalJSON.seventh_line.filter((x) =>
        data.citations.includes(x)
      );
      const eighthLineMedals = medalJSON.eighth_line.filter((x) =>
        data.citations.includes(x)
      );

      let medals = [
        firstLineMedals.reverse(),
        secondLineMedals.reverse(),
        thirdLineMedals.reverse(),
        fourthLineMedals.reverse(),
        fifthLineMedals.reverse(),
        sixthLineMedals.reverse(),
        seventhLineMedals.reverse(),
        eighthLineMedals.reverse(),
      ];

      //if a line is empty remove it
      medals = medals.filter((x) => x.length != 0);

      //

      for (const [index, row] of medals.entries()) {
        let corner;
        //bottom 2 lines accomodate 4 medals
        if (index == 1 || index == 0 || index == 2) {
          corner = leftEndFirstLine2X - (4 - row.length) * 32;
          //if current line has less than 4 medals move the medals from the last element of the next line to the current line untill 4 medals are reached
          if (medals[index + 1]) {
            //

            let count = 1;
            while (row.length < 4) {
              //

              //move the medals from the next row to the current row
              //if the next row becomes empty move the elments from the next to next row
              //if the next to next row becomes empty move the elements from the next to next to next row
              //and so on
              if (!medals[index + count]) break;
              if (medals[index + count]?.length == 0) {
                count++;
                continue;
              }
              if (count > 6) break;
              const toPush = medals[index + count].pop();
              if (!toPush) break;
              row.push(toPush);
            }
            corner = leftEndFirstLine2X - (4 - row.length) * 32;
          }
        }

        if (index == 3 || index == 4) {
          corner = leftEndFirstLine2X - (3 - row.length) * 32;
          if (medals[index + 1]) {
            let count = 1;
            while (row.length < 3) {
              //move the medals from the next row to the current row
              //if the next row becomes empty move the elments from the next to next row
              //if the next to next row becomes empty move the elements from the next to next to next row
              //and so on
              if (!medals[index + count]) break;
              if (medals[index + count]?.length == 0) {
                count++;
                continue;
              }
              if (count > 6) break;
              const toPush = medals[index + count].pop();
              if (!toPush) break;
              row.push(toPush);
            }
            corner = leftEndFirstLine2X - (3 - row.length) * 32;
          }
        }
        if (index == 5 || index == 6) {
          //

          corner = leftEndFirstLine2X - (2 - row.length) * 32;
          if (medals[index + 1]) {
            let count = 1;
            while (row.length < 2) {
              //

              //move the medals from the next row to the current row
              //if the next row becomes empty move the elments from the next to next row
              //if the next to next row becomes empty move the elements from the next to next to next row
              //and so on
              if (!medals[index + count]) break;
              if (medals[index + count]?.length == 0) {
                count++;
                continue;
              }
              if (count > 6) break;
              const toPush = medals[index + count].pop();
              if (!toPush) break;
              row.push(toPush);
            }
            corner = leftEndFirstLine2X - (2 - row.length) * 32;
          }
        }
        if (index == 7) {
          corner = leftEndFirstLine2X;
        }
        //

        for (const [index1, singularMedal] of row.entries()) {
          //

          const medal = await loadImage(
            __dirname + `/../imge/Ribbons/${singularMedal}.png`
          );
          if (!corner) throw new Error("No corner");

          ctx.drawImage(
            medal,
            corner - index1 * 64,
            EndLine2Y - index * 20,
            64,
            20
          );
        }
      }
    }

    if (data.Uniform !== "Brown" && data.Uniform !== "Blue")
      throw new Error("Invalid uniform");
    if (data.Uniform === "Brown") {
      const collar = await loadImage(__dirname + "/../imge/brown_collar.png");
      ctx.drawImage(collar, 0, 0, 1398, 1000);
      const border = await loadImage(__dirname + "/../uni_border.png");
      ctx.drawImage(border, 0, 0, 1398, 1000);
    }
    if (data.Uniform === "Blue") {
      const collar = await loadImage(__dirname + "/../imge/blue_collar.png");
      ctx.drawImage(collar, 0, 0, 1398, 1000);
      const border = await loadImage(__dirname + "/../uni_border.png");
      ctx.drawImage(border, 0, 0, 1398, 1000);
    }
    if (
      Array.isArray(data.TrainingMedals) &&
      data.TrainingMedals.includes("RE")
    ) {
      // RE located over the lapel
      const re = await loadImage(__dirname + "/../imge/Training Badges/RE.png");
      ctx.drawImage(re, 0, 0, 1398, 1000);
    }
    //rank
    if (data.rank) {
      let rank;
      //check the old ranks
      //CHECK IMGE/RANK folder and subfolders via glob
      const files = await glob(__dirname + "/../imge/Rank/**/*.png", {
        absolute: true,
      }).catch((err) => console.log(err));
      let names;
      if (!files) throw new Error("No files found");

      if (process.platform === "win32") {
        names = files.map((file) => file.split("\\").pop());
      } else {
        names = files.map((file) => file.split("/").pop());
      }
      //if the rank is found in the imge/Rank folder
      if (names.includes(`${data.rank}.png`)) {
        rank = await loadImage(files[names.indexOf(`${data.rank}.png`)]);
      }

      if (!rank) throw new Error("Rank not found");
      ctx.drawImage(rank, 0, 0, 1398, 1000);
      const border = await loadImage(__dirname + "/../imge/border.png");
      ctx.drawImage(border, 0, 0, 1398, 1000);
    }

    const fileName = data.name + ".png"; // Create the file name
    const filePath = __dirname + "/../milpac/" + fileName; // Set the file path
    const buffer = canvas.toBuffer("image/png");
    try {
      fs.writeFileSync(filePath, buffer);
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }

    await userDataModel.findOneAndUpdate(
      {
        name: data.name,
      },
      { $set: data },
      {
        upsert: true,
      }
    );
  } catch (err) {
    throw new Error(err as string);
  }
};
export default main;
