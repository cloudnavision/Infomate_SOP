---

# 📄 Report: Aged Debtor Report Knowledge Transfer (SOP Foundation)

**Date of Session:** December 31, 2025

**Participants:** Kanu Parmar, Lasya Bogavarapu, Suchith Peiris, Osada Jayampathi, Robinson Kumara, Sandun Mihiranga, Devindu Chandupa.

---

## 1. Administrative & Folder Management

### 1.1 Shared Folder Structure

* **Location:** The master reports are housed in the `SBH Accounts Shared Folder` > `Credit Check` > `Aged Date`.
* **Hierarchy:** Folders are organized by fiscal year (e.g., `2025-2026`) and then by month (e.g., `December 2025`).
* **Shared Access:** A new shared folder is being established between **Informat** and **Starboard** to facilitate payment runs and centralized reporting.

### 1.2 Access Protocol

* **Authority:** Access is not granted by the finance team directly; it is managed by the **IT Team**.
* **Request Process:** To add a new user or modify permissions, an email must be received from a **General Manager (GM)**. That email must then be forwarded to IT for execution.

---

## 2. Weekly Technical Workflow (Step-by-Step)

### 2.1 Preparing the Worksheet

1. **Duplicate Previous Week:** Open the most recent report. Right-click the tab (e.g., `17th Dec`) and select "Move or Copy" to create a new tab for the current week (e.g., `24th Dec`).
2. **Date Update:** Update the **"As At" Date** in the header.
* *Note:* The sheet is formula-driven. Updating this header date automatically recalculates **Column L** (Movement since last report).


3. **Data Sanitization:** Clear all data from the previous week in the main grid and the "Comments" section to ensure a "clean slate."
4. **Finalization:** The report should only be renamed with the suffix `_FINAL` after all data has been verified and cross-checked.

### 2.2 Data Entry & The "Spoon-Feeding" Requirement

* The team must frequently "spoon-feed" GMs by manually correcting their inputs.
* **Manual Summing:** Do not rely on the totals provided in GM Excel files. Kanu demonstrated that you must manually sum the buckets (**Current, 30+, 60+, 90+, 120+ days**) to ensure they match the **Total Balance** on the hotel’s source PDF.

---

## 3. Validation & Reporting Deadlines

* **Internal Goal:** Monday morning.
* **Hard Deadline:** Tuesday before lunch.
* **Consequence of Delay:** If reports are not out by Tuesday, GMs and Directors (specifically mentioned: Ivan, Darren, Nimisha, Fraser, and Paul) will begin "shouting" and "flashing emails" to the entire team by Wednesday morning.

---

## 4. Property-Specific Discrepancy Log

The SOP must include a "Watch List" for hotels that consistently fail to provide accurate data:

| Property | Known Issues / Required Actions |
| --- | --- |
| **Gatwick** | **Model Property:** Consistently provides AR and PM reports in both Excel and PDF. |
| **Wyndermere** | Consistently uses incorrect formats. Manual totals rarely match Excel formulas. |
| **Derby** | Habitually misses deadlines. Sends PDF only; rarely sends the Excel version or PM reports. |
| **Weatherby** | Frequently fails to provide the Excel version of the report. |
| **Clifton** | Often provides incomplete data and misses the Excel requirement. |
| **Burnley** | Sends reports with **handwritten notes** on a PDF; requires manual transcription. |
| **Tamworth** | Sends Excel reports but omits the PM backup data required for verification. |

---

## 5. Policy Decisions & Critical Nuances

### 5.1 The "Negative Balance" Conflict

* **The Issue:** Negative numbers represent customer refunds. Mixing them with debt totals provides a misleadingly low "Total Debt" figure.
* **SOP Instruction:** The report will transition to a **two-table format**. Table A will show actual Aged Debt; Table B will show Credits/Refunds.

### 5.2 Permanent Folios ("The Two-Day Rule")

* Current reports show a "7 Days+" column for Permanent Folios.
* **New Rule:** This must be changed to **2 days**. If a customer has not paid within 2 days, they must be moved from the Permanent Folio to the **AR Ledger** immediately.

### 5.3 Credit Limits

* For **Group Bookings** (e.g., at Clifton), a standard credit limit of **£5,000** is usually applied.
* The SOP must include a new column to track these credit checks and limits per property.

---

## 6. Future System Improvements (V2)

* **Comments Layout:** The team agreed to move comments from the bottom of the sheet to a **side-by-side column** next to the hotel names to eliminate excessive scrolling.
* **The "Zig-Zag" Graph:** The current trend graph was deemed useless ("looks like a Leonardo da Vinci painting"). The tech team will be tasked with creating a realistic time-series analysis.
* **Refund Forms:** A standardized refund form is to be created, requiring customer signatures and GM approval before a refund can be recorded in the AR.

---

### Instructions for SOP Creation:

* Ensure the **"Manual Summing"** step is highlighted as a mandatory control to catch GM errors.
* Include a screenshot of the **Gatwick folder** as the "Gold Standard" for how files should be named and filed.
* Define the **Tuesday Lunch** deadline as the "Critical Path" for the Finance Team.

##Transcript

Here is the full verbatim transcript of the meeting. This transcript captures the technical steps, policy discussions, and individual property issues discussed during the Knowledge Transfer (KT) session.

---

### **Full Transcript: Aged Debtor Report (KT Session)**

**Date:** 2025-12-31

**Duration:** ~25 minutes

**[00:00] Kanu Parmar:** Morning Lasya.

**[00:07] Lasya Bogavarapu:** Hi Kanu. Is it just you in the office today?

**[00:13] Kanu Parmar:** Oh, just me and my ghost. (Laughs). Can you see my screen?

**[00:27] Suchith Peiris:** Yes, yes.

**[00:32] Kanu Parmar:** Okay, let me show this one here from this folder... which is the SBH Accounts shared folder. There's a 'Credit Check' folder under that.

**[00:52] Suchith Peiris:** Yeah, I'm sorry to interrupt Kanu. Since this is a KT session, we will be asking questions from the beginning itself. For this particular folder path, we still don't have access, but we will be getting access, right?

**[01:10] Lasya Bogavarapu:** Suchith, maybe you might... I mean, we might have a shared access folder. So we can create a new folder in that and we can do that. We wanted to create a new shared folder between Informat and Starboard. Either payment runs or everything, you can set it up in that folder.

**[01:33] Suchith Peiris:** Okay, okay. Thank you, Lasya.

**[01:38] Kanu Parmar:** Yeah, so as Lasya said, you have the folder going to be set up. But I just want to show where this file is located. Because it’s multiple folders. Under this shared folder is 'Credit Check', and under that is another folder called 'As At Date'. This has all been set up previously.

**[02:07] Kanu Parmar:** We are looking for 25-26 for the AR reporting. Before that, it was like, you know, all files were there... we didn't know which month it was. So what I did, I set it up separately month-wise and grouped them.

**[02:27] Kanu Parmar:** Under December, there is again 'AR Reporting - SBH'. This is purely because the old GMs' emails were different IDs which shouldn't have been shared for reporting. Long story short, this is the folder that around 44 people can access.

**[03:09] Kanu Parmar:** There is no one who can't access this unless GM says this is a new person or this person has to be added. If that email comes, you just forward that to the IT team and they will look after the access authority.

**[03:45] Kanu Parmar:** Once it’s done, everyone can access. Darren, Nimisha, all the people. Again, what I did for month-wise, because what we're doing is the AR report which we'll talk about in a minute... at the same time, we're supposed to send this folder as well where they're going to save the documents of all those files.

**[04:26] Kanu Parmar:** Every week we are sending this folder. So what I suggest to them is, if I can give this folder for the whole month. For December, four folders or five folders. The first email I send will say 'this is the folder I created' and create the link in the email so they can access it.

**[04:47] Kanu Parmar:** Last two weeks, I can see they are very comfortable. Some GMs are doing this reporting very fast or on time. They don't need to come to me or wait for my next email for the folders. Reporting is simple, they aren't worried about it. Only Ivan, Darren, Nimisha... all the management accountants need to know the reporting.

**[05:20] Kanu Parmar:** Main task is where they save the documents. I created the folder for December. From today, I'm going to create the folder for January as well. That’s the first step.

**[05:48] Kanu Parmar:** On the 24th of December... last week was this folder. All I just checked it... they have dumped everything here. I can see from the size of the Excel file, I'm 100% sure some are missing, but I’m not worried at the moment.

**[06:12] Kanu Parmar:** Last week, the 17th of December, I completed it. This is my sign—that means it's the final report. I create the Excel report for AR, all the worksheet PDFs for management as well. Once it’s done, checked and verified, then I can give it the name 'Final'.

**[06:51] Kanu Parmar:** Once it's done, then I send that file to all the 44 people.

**[07:05] Kanu Parmar:** Is it okay? Can you read this worksheet or should I make it bigger?

**[07:14] Suchith Peiris:** Yeah, it's better now.

**[07:23] Kanu Parmar:** So the first thing, today I need to do it. As I said on your flowchart, Tuesday is the cut-off date. Monday they are expecting it, but Tuesday has to go to all the GMs. Otherwise, on Wednesday they start shouting and flashing emails to everyone.

**[07:50] Kanu Parmar:** My goal is to get it at least by Monday, otherwise first thing in the morning before lunch, I shoot out the email to the AR reporting.

**[08:08] Kanu Parmar:** First thing on this worksheet... I just copy this file. Once it's done, I say this is going to be the 24th. And here as well, we need to change the date to the 24th. The moment I change the 24th here, you can see column L—it will be changed to the 17th of December. It's all formulated, you don't need to do anything, just change the date.

**[09:02] Kanu Parmar:** After that, I just clean up this whole worksheet. I don’t need this data here. Clear it completely. Same way, all these comments from the last report—because this is a copy—we don't need any comments or numbers. So it is clear.

**[09:30] Kanu Parmar:** This is the working sheet that we need to update the data.

**[09:42] Kanu Parmar:** Let me go to the 24th. I can see from here... let me show how it works. First thing, there are two or three issues with this AR reporting. Particularly for Derby, Weatherby, and Clifton. Some of these hotels are not sending the Excel file. They are sending the AR report in PDF only.

**[10:19] Kanu Parmar:** Derby is not even sending PM reports. So I asked to send the email and say 'this is what I'm missing, Excel report or the PDF for PM'. Afterwards, they send it. But you need to always inform them or make a note that we haven’t received it.

**[10:50] Kanu Parmar:** Otherwise, what they do is put the PM report numbers into the Excel file, but we don't know how the numbers come. That’s what Nimisha, Fraser, and Paul need to know.

**[11:15] Kanu Parmar:** Another thing is, I found sometimes they are doing some manual totals. My side, I’m not relying on their worksheet. If they are doing manual formulas or adding with a calculator, I’ve seen the worksheet doesn’t match. You have to be careful. You can copy from here, but I always double-check.

**[13:18] Kanu Parmar:** Look at this number... Wyndermere Manor. I copy this number. Value paste. Straight away you can see these numbers don't match the total. This is the balance he’s saying here, but I need to check again. This is what they are doing, messing around with Wyndermere all the time. I told them to change the format to what it is saying here.

**[14:35] Kanu Parmar:** This is what we need to do, a little bit of spoon-feeding for them. I don't understand why they aren't doing it in that format.

**[15:30] Suchith Peiris:** Kanu, sorry... what if the numbers are incorrect in both the PDF and the Excel sheet? To whom do we need to reach?

**[15:40] Kanu Parmar:** You need to go to the GM, the General Manager. And say 'we got these numbers here'. 99% your PDF report will be there.

**[16:08] Lasya Bogavarapu:** Kanu, I have a question. So you’re saying that 511 is wrong?

**[16:15] Kanu Parmar:** No, no, it's not wrong. But if I take my current balance, which is less than 30 days... see this 1023? This is what we are looking for. But it's telling me 1022.6. That’s the total. I need to check the difference.

**[17:05] Lasya Bogavarapu:** But this 511, isn’t it the calculation for current plus 30 plus 60 plus 90 plus 120?

**[17:15] Kanu Parmar:** Yeah, but this is less than 30 days which is this total. 3124. That's what I do manually. The 1022 matches with the 511 balance on the AR report. But sometimes in a control account, they say 126. I'm looking from a technical accounting point of view.

**[19:20] Kanu Parmar:** If this is my balance across the buckets, and it's 511, that's fine. But what does it represent? I looked at it last month and two months ago to see what is the control account of this Wyndermere in the balance sheet.

**[20:05] Kanu Parmar:** Another thing, we don't do any changes here manually. This is all formulated. Look at the bad debts—all formula based.

**[20:23] Suchith Peiris:** Could you please more elaborate on this control account? The 1.026 million?

**[20:34] Kanu Parmar:** This balance, probably in the balance sheet item 'Debtors Control Account' of this particular hotel. How much is the total? Because control account balance and the aged debtor balance should match in a real world.

**[21:02] Osada Jayampathi:** Sorry guys, if you hear background noise, I'm outside at the moment. Just wanted to know Kanu regarding these minus numbers. Do we require those numbers in this report? Requirement is to follow up debtors, but the minus numbers represent that we need to pay customers—refund them back.

**[23:08] Kanu Parmar:** Good question. Lasya, you were saying something?

**[23:13] Lasya Bogavarapu:** Technically at the moment, we want to create a new Excel sheet completely. Kanu is just giving you an idea of what is happening. Nimisha expects you to create a new sheet which gives more details.

**[23:35] Lasya Bogavarapu:** Kanu is mentioning that some people might not even mention any comments about what is happening in their AR ledger. We want to keep an eye on it. Even after a week, if it's the same figures, we might not see improvement.

**[24:00] Lasya Bogavarapu:** We are expecting you to create a new Excel sheet. The 511 is covering up the refund amounts too. So we can create two tabular items: one for refunds and one for the original debtors' amount.

**[24:28] Kanu Parmar:** That's right. Because minus numbers straight away create questions—why is it minus? Why do we have minus in 120 days plus? It’s just for the bosses to discuss with GMs and Directors.

**[25:08] Lasya Bogavarapu:** And one more thing related to Permanent Folios. It says 7 days plus, but ideally it should be only 2 days. If any customer is not paying within 2 days, it should ideally be moved to the AR Ledger.

**[25:38] Lasya Bogavarapu:** You will receive two reports every month: PM report and AR report. PM is different. Tamworth and Birmingham... these people put the number here, 291. But I don't have the backup data for it. So I ask them, I need the PM report for it.

**[27:18] Kanu Parmar:** This is what I was saying earlier. Excel report for AR, PM report in PDF, or both. Excel is most important. Tamworth gave this Excel report, but I want to see this 291, where it comes from.

**[28:03] Suchith Peiris:** And Kanu, would you be able to show us an actual PM report in PDF format?

**[28:13] Kanu Parmar:** Definitely, let me check this one. Headlands PM report. Look like this: PM Account by Room. As Lasya mentioned, 7 days and 2 days. If it's 23rd to 24th... if it's 23rd to 26th, the number would be here.

**[29:30] Lasya Bogavarapu:** Kanu, do you see any other formats apart from these two? You showed us Wyndermere and Weatherby.

**[29:43] Kanu Parmar:** No, it’s only two formats. Gatwick is doing it right. AR report in PDF and Excel, and PM report in PDF. That's the condition. That’s what they decided to do.

**[31:12] Kanu Parmar:** Okay, if it’s all good?

**[31:20] Robinson Kumara:** Suchith, I just wanted to check on the capacity and new scope areas suggested by Lasya. Just check on how we are going to add that and embed it into our scope.

**[31:37] Suchith Peiris:** Yeah, sure Robinson.

**[31:48] Lasya Bogavarapu:** Every call ends with Suchith’s dialogue. (Laughs).

**[32:01] Suchith Peiris:** All right guys, thank you so much. Have a call with Nigel.

**[32:25] All:** Bye everyone. (Meeting Ends).