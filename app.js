(function () {
  ("use strict");

  // Grade-to-point mappings per regulation. Failures and non-completions map to 0.
  const GRADE_MAP = {
    2021: {
      O: 10,
      "A+": 9,
      A: 8,
      "B+": 7,
      B: 6,
      C: 5,
      RA: 0,
      SA: 0,
      W: 0,
    },
    2017: {
      O: 10,
      "A+": 9,
      A: 8,
      "B+": 7,
      B: 6,
      RA: 0,
      SA: 0,
      W: 0,
    },
    2013: {
      S: 10,
      A: 9,
      B: 8,
      C: 7,
      D: 6,
      E: 5,
      U: 0,
      SA: 0,
      W: 0,
    },
  };

  // DOM elements
  const regulationSelect = document.getElementById("anna-calc-regulation");
  const semestersContainer = document.getElementById("anna-calc-semesters");
  const addSemesterBtn = document.getElementById("anna-calc-add-semester");
  const calculateBtn = document.getElementById("anna-calc-calculate");
  const resultSection = document.getElementById("anna-calc-result-section");
  const resultDiv = document.getElementById("anna-calc-result");
  const pdfBtn = document.getElementById("anna-calc-pdf");
  const copyBtn = document.getElementById("anna-calc-copy");
  const resetBtn = document.getElementById("anna-calc-reset");

  // Internal state representation. This is saved to / loaded from sessionStorage.
  let state = {
    regulation: "2021",
    semesters: [],
    result: null,
  };

  let semesterCounter = 0;
  let subjectCounter = 0;

  /* Load persisted state from sessionStorage if available. */
  function loadState() {
    const stored = sessionStorage.getItem("anna-calc-state");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === "object") {
          state = parsed;
          // Reset counters based on existing ids to avoid duplicates.
          // Counters are incremented whenever new semesters/subjects are created.
          state.semesters.forEach((sem) => {
            const semNum = parseInt(sem.id.split("-")[1], 10);
            if (!Number.isNaN(semNum) && semNum >= semesterCounter) {
              semesterCounter = semNum;
            }
            sem.subjects.forEach((sub) => {
              const subNum = parseInt(sub.id.split("-")[1], 10);
              if (!Number.isNaN(subNum) && subNum >= subjectCounter) {
                subjectCounter = subNum;
              }
            });
          });
        }
      } catch (err) {
        console.error("Failed to parse stored state:", err);
      }
    }
  }

  /* Persist current state to sessionStorage. */
  function saveState() {
    try {
      sessionStorage.setItem("anna-calc-state", JSON.stringify(state));
    } catch (err) {
      console.error("Failed to save state:", err);
    }
  }

  /* Initialize the calculator. Creates default semester if none exist. */
  function init() {
    loadState();
    // If no semesters in state, create one by default
    if (!state.semesters || state.semesters.length === 0) {
      addSemester(true); // true indicates no render yet
    }
    // Set regulation select to saved value
    regulationSelect.value = state.regulation;
    // Render semesters
    renderAllSemesters();
    // If result exists, show result
    if (state.result) {
      renderResult(state.result);
      resultSection.style.display = "block";
    }
    // Event listeners
    regulationSelect.addEventListener("change", () => {
      state.regulation = regulationSelect.value;
      saveState();
      // Clear any existing result since grade mapping may differ
      state.result = null;
      resultSection.style.display = "none";
    });
    addSemesterBtn.addEventListener("click", () => {
      addSemester();
    });
    calculateBtn.addEventListener("click", () => {
      handleCalculate();
    });
    pdfBtn.addEventListener("click", () => {
      exportToPDF();
    });
    copyBtn.addEventListener("click", () => {
      copyResultToClipboard();
    });
    resetBtn.addEventListener("click", () => {
      handleReset();
    });
  }

  /* Create a new semester and optionally render the view. */
  function addSemester(skipRender = false) {
    semesterCounter += 1;
    const semId = `sem-${semesterCounter}`;
    const newSemester = {
      id: semId,
      subjects: [createSubject()],
    };
    state.semesters.push(newSemester);
    saveState();
    if (!skipRender) {
      renderAllSemesters();
    }
  }

  /* Remove a semester by id. */
  function removeSemester(semId) {
    state.semesters = state.semesters.filter((sem) => sem.id !== semId);
    // Clear result upon structural change
    state.result = null;
    saveState();
    renderAllSemesters();
    resultSection.style.display = "none";
  }

  /* Create a new subject object with unique id. */
  function createSubject() {
    subjectCounter += 1;
    return {
      id: `sub-${subjectCounter}`,
      name: "",
      credits: "",
      grade: "",
    };
  }

  /* Add a new subject to a given semester. */
  function addSubject(semId) {
    const sem = state.semesters.find((s) => s.id === semId);
    if (sem) {
      sem.subjects.push(createSubject());
      // Clear result when structure changes
      state.result = null;
      saveState();
      renderAllSemesters();
      resultSection.style.display = "none";
    }
  }

  /* Remove a subject from a semester. */
  function removeSubject(semId, subId) {
    const sem = state.semesters.find((s) => s.id === semId);
    if (sem) {
      sem.subjects = sem.subjects.filter((sub) => sub.id !== subId);
      // Ensure at least one subject remains
      if (sem.subjects.length === 0) {
        sem.subjects.push(createSubject());
      }
      state.result = null;
      saveState();
      renderAllSemesters();
      resultSection.style.display = "none";
    }
  }

  /* Update a field (name, credits, grade) on a subject. */
  function updateSubjectField(semId, subId, field, value) {
    const sem = state.semesters.find((s) => s.id === semId);
    if (sem) {
      const sub = sem.subjects.find((s) => s.id === subId);
      if (sub) {
        sub[field] = value;
        // Clear result on changes
        state.result = null;
        saveState();
        // Do not re-render entire structure to maintain user focus; validation handled on calculate
      }
    }
  }

  /* Render all semesters from the current state. */
  function renderAllSemesters() {
    semestersContainer.innerHTML = "";
    state.semesters.forEach((semester, index) => {
      const semElem = renderSemester(semester, index);
      semestersContainer.appendChild(semElem);
    });
  }

  /* Create the DOM for a single semester including its subjects. */
  function renderSemester(semester, index) {
    const semDiv = document.createElement("div");
    semDiv.classList.add("anna-calc-semester");
    semDiv.dataset.id = semester.id;

    // Header
    const headerDiv = document.createElement("div");
    headerDiv.classList.add("anna-calc-semester-header");
    const title = document.createElement("span");
    title.classList.add("anna-calc-semester-title");
    title.textContent = `Semester ${index + 1}`;
    headerDiv.appendChild(title);
    // Remove semester button (only if more than one semester)
    if (state.semesters.length > 1) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.classList.add("anna-calc-remove-semester-btn");
      removeBtn.innerHTML = `<i class="fa-solid fa-xmark"></i>`;
      removeBtn.addEventListener("click", () => {
        removeSemester(semester.id);
      });
      headerDiv.appendChild(removeBtn);
    }
    semDiv.appendChild(headerDiv);

    // Table container for responsiveness
    const tableContainer = document.createElement("div");
    tableContainer.classList.add("anna-calc-subject-table-container");

    // Table for subjects
    const table = document.createElement("table");
    table.classList.add("anna-calc-subject-table");

    // Create table headers
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["Subject Name", "Credits", "Grade", "Actions"].forEach((text) => {
      const th = document.createElement("th");
      th.textContent = text;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    semester.subjects.forEach((sub) => {
      const row = document.createElement("tr");

      // Name cell
      const nameCell = document.createElement("td");
      nameCell.setAttribute("data-label", "Subject Name");
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = sub.name || "";
      nameInput.placeholder = "Subject name (optional)";
      nameInput.classList.add("st-general-input");
      nameInput.addEventListener("input", (e) => {
        updateSubjectField(semester.id, sub.id, "name", e.target.value);
      });
      nameCell.appendChild(nameInput);
      row.appendChild(nameCell);

      // Credits cell
      const creditCell = document.createElement("td");
      creditCell.setAttribute("data-label", "Credits");
      const creditInput = document.createElement("input");
      creditInput.type = "number";
      creditInput.min = "0";
      creditInput.step = "0.5";
      creditInput.value = sub.credits;
      creditInput.placeholder = "Credits";
      creditInput.classList.add("st-general-input");
      creditInput.addEventListener("input", (e) => {
        updateSubjectField(semester.id, sub.id, "credits", e.target.value);
      });
      creditCell.appendChild(creditInput);
      row.appendChild(creditCell);

      // Grade cell
      const gradeCell = document.createElement("td");
      gradeCell.setAttribute("data-label", "Grade");
      const gradeSelect = document.createElement("select");
      gradeSelect.innerHTML = generateGradeOptions(state.regulation);
      gradeSelect.value = sub.grade;
      gradeSelect.classList.add("st-general-select");
      gradeSelect.addEventListener("change", (e) => {
        updateSubjectField(semester.id, sub.id, "grade", e.target.value);
      });
      gradeCell.appendChild(gradeSelect);
      row.appendChild(gradeCell);

      // Remove subject cell
      const removeCell = document.createElement("td");
      removeCell.setAttribute("data-label", "Actions");
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.classList.add("anna-calc-remove-subject");
      removeBtn.innerHTML = `<i class="fa-solid fa-trash-arrow-up"></i>`;
      removeBtn.title = "Remove subject";
      removeBtn.addEventListener("click", () => {
        removeSubject(semester.id, sub.id);
      });
      removeCell.appendChild(removeBtn);
      row.appendChild(removeCell);

      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    tableContainer.appendChild(table);
    semDiv.appendChild(tableContainer);

    // Add subject button
    const addSubBtn = document.createElement("button");
    addSubBtn.type = "button";
    addSubBtn.classList.add("st-general-btn", "st-main-calculation-btn");
    addSubBtn.innerHTML = `<i class="fa-solid fa-plus"></i> Add Subject`;
    addSubBtn.addEventListener("click", () => {
      addSubject(semester.id);
    });
    semDiv.appendChild(addSubBtn);

    return semDiv;
  }

  /* Generate grade options HTML for the current regulation. */
  function generateGradeOptions(reg) {
    const map = GRADE_MAP[reg];
    let options = '<option value="">Select grade</option>';
    Object.keys(map).forEach((grade) => {
      options += `<option value="${grade}">${grade}</option>`;
    });
    return options;
  }

  /* Validate all inputs before calculation. Highlights invalid fields. */
  function validateInputs() {
    let isValid = true;
    // Iterate over semester elements in the DOM to sync validation with UI
    const semesterDivs = semestersContainer.querySelectorAll(
      ".anna-calc-semester"
    );
    semesterDivs.forEach((semDiv) => {
      const semId = semDiv.dataset.id;
      const sem = state.semesters.find((s) => s.id === semId);
      if (!sem) return;
      // Iterate subject rows
      const rows = semDiv.querySelectorAll("tbody tr");
      rows.forEach((row, index) => {
        const inputs = row.querySelectorAll("input, select");
        const nameInput = inputs[0];
        const creditInput = inputs[1];
        const gradeSelect = inputs[2];
        // Credits validation
        const creditVal = parseFloat(creditInput.value);
        if (!creditInput.value || Number.isNaN(creditVal) || creditVal <= 0) {
          isValid = false;
          creditInput.style.borderColor = "var(--anna-calc-danger)";
        } else {
          creditInput.style.borderColor = "var(--anna-calc-border)";
        }
        // Grade validation
        if (!gradeSelect.value) {
          isValid = false;
          gradeSelect.style.borderColor = "var(--anna-calc-danger)";
        } else {
          gradeSelect.style.borderColor = "var(--anna-calc-border)";
        }
      });
    });
    return isValid;
  }

  /* Handle calculation of GPA and CGPA. */
  function handleCalculate() {
    if (!validateInputs()) {
      alert(
        "Please ensure all credits are positive numbers and all grades are selected."
      );
      return;
    }
    const currentRegMap = GRADE_MAP[state.regulation];
    const semesterResults = [];
    let totalWeightedAll = 0;
    let totalCreditsAll = 0;
    state.semesters.forEach((sem) => {
      let weightedSum = 0;
      let creditSum = 0;
      const breakdown = [];
      sem.subjects.forEach((sub) => {
        const credit = parseFloat(sub.credits);
        const grade = sub.grade;
        const gp = currentRegMap[grade] ?? 0;
        const weighted = credit * gp;
        weightedSum += weighted;
        creditSum += credit;
        breakdown.push({
          name: sub.name,
          credit,
          grade,
          gradePoint: gp,
          weighted,
        });
      });
      const gpa = creditSum > 0 ? weightedSum / creditSum : 0;
      semesterResults.push({
        semesterId: sem.id,
        gpa,
        weightedSum,
        creditSum,
        breakdown,
      });
      totalWeightedAll += weightedSum;
      totalCreditsAll += creditSum;
    });
    const cgpa = totalCreditsAll > 0 ? totalWeightedAll / totalCreditsAll : 0;
    const result = {
      regulation: state.regulation,
      semesters: semesterResults,
      totalWeightedAll,
      totalCreditsAll,
      cgpa,
    };
    state.result = result;
    saveState();
    renderResult(result);
    resultSection.style.display = "block";
  }

  /* Render the result summary and breakdown tables */
  function renderResult(result) {
    resultDiv.innerHTML = "";

    // Keep existing summary elements as-is
    const regP = document.createElement("p");
    regP.innerHTML = `<strong>Regulation:</strong> ${result.regulation}`;
    resultDiv.appendChild(regP);

    const totalCreditsP = document.createElement("p");
    totalCreditsP.innerHTML = `<strong>Total Credits:</strong> ${result.totalCreditsAll.toFixed(
      2
    )}`;
    resultDiv.appendChild(totalCreditsP);

    const totalWeightedP = document.createElement("p");
    totalWeightedP.innerHTML = `<strong>Total Weighted Points:</strong> ${result.totalWeightedAll.toFixed(
      2
    )}`;
    resultDiv.appendChild(totalWeightedP);

    const cgpaP = document.createElement("p");
    cgpaP.innerHTML = `<strong>CGPA:</strong> ${result.cgpa.toFixed(3)}`;
    resultDiv.appendChild(cgpaP);

    // For each semester, create a responsive table
    result.semesters.forEach((semRes, idx) => {
      const heading = document.createElement("h3");
      heading.textContent = `Semester ${idx + 1} – GPA: ${semRes.gpa.toFixed(
        3
      )}`;
      resultDiv.appendChild(heading);

      // Create responsive table container
      const tableContainer = document.createElement("div");
      tableContainer.classList.add("anna-calc-result-table-container");

      const table = document.createElement("table");
      table.classList.add("anna-calc-result-table");

      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      ["Subject", "Credits", "Grade", "Grade Point", "Weighted"].forEach(
        (text) => {
          const th = document.createElement("th");
          th.textContent = text;
          headerRow.appendChild(th);
        }
      );
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      semRes.breakdown.forEach((item) => {
        const row = document.createElement("tr");

        // Subject cell with data-label for mobile
        const nameCell = document.createElement("td");
        nameCell.setAttribute("data-label", "Subject");
        nameCell.textContent = item.name || "-";
        row.appendChild(nameCell);

        // Credits cell with data-label for mobile
        const creditCell = document.createElement("td");
        creditCell.setAttribute("data-label", "Credits");
        creditCell.textContent = item.credit.toFixed(2);
        row.appendChild(creditCell);

        // Grade cell with data-label for mobile
        const gradeCell = document.createElement("td");
        gradeCell.setAttribute("data-label", "Grade");
        gradeCell.textContent = item.grade;
        row.appendChild(gradeCell);

        // Grade Point cell with data-label for mobile
        const gpCell = document.createElement("td");
        gpCell.setAttribute("data-label", "Grade Point");
        gpCell.textContent = item.gradePoint.toFixed(0);
        row.appendChild(gpCell);

        // Weighted cell with data-label for mobile
        const weightedCell = document.createElement("td");
        weightedCell.setAttribute("data-label", "Weighted");
        weightedCell.textContent = item.weighted.toFixed(2);
        row.appendChild(weightedCell);

        tbody.appendChild(row);
      });
      table.appendChild(tbody);

      // Wrap table in responsive container
      tableContainer.appendChild(table);
      resultDiv.appendChild(tableContainer);
    });
  }

  /* Export the current result as a custom formatted PDF using jsPDF and autoTable */
  function exportToPDF() {
    if (!state.result) return;

    // Load jsPDF and autoTable libraries dynamically
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => {
      const script2 = document.createElement("script");
      script2.src =
        "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js";
      script2.onload = generatePDF;
      document.head.appendChild(script2);
    };
    document.head.appendChild(script);

    function generatePDF() {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF("p", "mm", "a4");

      // Set document properties
      doc.setProperties({
        title: "Anna University GPA/CGPA Result",
        subject: "Academic Performance Report",
        author: "Anna University Calculator",
      });

      // Add header
      doc.setFontSize(20);
      doc.setTextColor(67, 97, 238); // #4361ee
      doc.text("Anna University GPA / CGPA Result", 105, 20, {
        align: "center",
      });

      // Add regulation and summary
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(`Regulation: ${state.result.regulation}`, 20, 35);
      doc.text(
        `Total Credits: ${state.result.totalCreditsAll.toFixed(2)}`,
        20,
        42
      );
      doc.text(
        `Total Weighted Points: ${state.result.totalWeightedAll.toFixed(2)}`,
        20,
        49
      );
      doc.text(`CGPA: ${state.result.cgpa.toFixed(3)}`, 20, 56);

      let yPosition = 70;

      // Add each semester's breakdown
      state.result.semesters.forEach((semRes, idx) => {
        // Check if we need a new page
        if (yPosition > 250) {
          doc.addPage();
          yPosition = 20;
        }

        // Semester header
        doc.setFontSize(14);
        doc.setTextColor(67, 97, 238);
        doc.text(
          `Semester ${idx + 1} - GPA: ${semRes.gpa.toFixed(3)}`,
          20,
          yPosition
        );
        yPosition += 10;

        // Create table data
        const tableData = semRes.breakdown.map((item) => [
          item.name || "-",
          item.credit.toFixed(2),
          item.grade,
          item.gradePoint.toFixed(0),
          item.weighted.toFixed(2),
        ]);

        // Add semester table
        doc.autoTable({
          head: [["Subject", "Credits", "Grade", "Grade Point", "Weighted"]],
          body: tableData,
          startY: yPosition,
          margin: { left: 20, right: 20 },
          headStyles: {
            fillColor: [67, 97, 238],
            textColor: [255, 255, 255],
            fontSize: 10,
            fontStyle: "bold",
          },
          bodyStyles: {
            fontSize: 9,
            textColor: [0, 0, 0],
          },
          alternateRowStyles: {
            fillColor: [230, 240, 255],
          },
          theme: "grid",
          styles: {
            cellPadding: 3,
            overflow: "linebreak",
            halign: "center",
          },
          columnStyles: {
            0: { halign: "left", cellWidth: 60 },
            1: { cellWidth: 25 },
            2: { cellWidth: 25 },
            3: { cellWidth: 30 },
            4: { cellWidth: 30 },
          },
        });

        // Update y position for next section
        yPosition = doc.lastAutoTable.finalY + 15;
      });

      // Add footer with page numbers
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.setTextColor(128, 128, 128);
        doc.text(
          `Page ${i} of ${pageCount}`,
          doc.internal.pageSize.width / 2,
          doc.internal.pageSize.height - 10,
          { align: "center" }
        );
        doc.text(
          "Generated by Anna University GPA/CGPA Calculator",
          20,
          doc.internal.pageSize.height - 10
        );
      }

      // Save the PDF
      doc.save(
        `Anna_University_GPA_Result_${
          new Date().toISOString().split("T")[0]
        }.pdf`
      );
    }
  }

  /* Copy the textual result summary to the clipboard with improved formatting */
  function copyResultToClipboard() {
    if (!state.result) return;

    let text = "";

    // Header
    text += "╔═══════════════════════════════════════╗\n";
    text += "║   ANNA UNIVERSITY GPA/CGPA RESULT    ║\n";
    text += "╚═══════════════════════════════════════╝\n\n";

    // Summary
    text += "SUMMARY\n";
    text += "════════════════════════════════════════\n";
    text += `Regulation:        ${state.result.regulation}\n`;
    text += `Total Credits:     ${state.result.totalCreditsAll.toFixed(2)}\n`;
    text += `Total Weighted:    ${state.result.totalWeightedAll.toFixed(2)}\n`;
    text += `CGPA:              ${state.result.cgpa.toFixed(3)}\n\n`;

    // Semester details
    state.result.semesters.forEach((semRes, idx) => {
      text += `SEMESTER ${idx + 1}\n`;
      text += `GPA: ${semRes.gpa.toFixed(3)}\n`;
      text += "────────────────────────────────────────\n";

      // Table header
      text += padRight("Subject", 30) + " ";
      text += padLeft("Credits", 8) + " ";
      text += padLeft("Grade", 8) + " ";
      text += padLeft("GP", 6) + " ";
      text += padLeft("Weighted", 10) + "\n";
      text += "─".repeat(68) + "\n";

      // Table rows
      semRes.breakdown.forEach((item) => {
        const subjectName =
          item.name || `Subject ${semRes.breakdown.indexOf(item) + 1}`;
        text += padRight(subjectName.substring(0, 28), 30) + " ";
        text += padLeft(item.credit.toFixed(2), 8) + " ";
        text += padLeft(item.grade, 8) + " ";
        text += padLeft(item.gradePoint.toFixed(0), 6) + " ";
        text += padLeft(item.weighted.toFixed(2), 10) + "\n";
      });

      // Semester totals
      text += "─".repeat(68) + "\n";
      text += padRight("TOTAL", 30) + " ";
      text += padLeft(semRes.creditSum.toFixed(2), 8) + " ";
      text += padLeft("", 8) + " ";
      text += padLeft("", 6) + " ";
      text += padLeft(semRes.weightedSum.toFixed(2), 10) + "\n\n";
    });

    // Overall CGPA
    text += "════════════════════════════════════════\n";
    text += `OVERALL CGPA: ${state.result.cgpa.toFixed(3)}\n`;
    text += "════════════════════════════════════════\n";
    text += "\nGenerated by Anna University GPA/CGPA Calculator\n";
    text += new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Helper function for text alignment
    function padLeft(str, length) {
      return str.toString().padStart(length, " ");
    }

    function padRight(str, length) {
      return str.toString().padEnd(length, " ");
    }

    // Copy to clipboard
    navigator.clipboard
      .writeText(text)
      .then(() => {
        // Show success notification
        const originalText = copyBtn.textContent;
        copyBtn.textContent = "✓ Copied!";
        copyBtn.style.backgroundColor = "var(--anna-calc-success)";

        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.backgroundColor = "";
        }, 2000);
      })
      .catch((err) => {
        console.error("Failed to copy:", err);
        alert(
          "Failed to copy to clipboard. Please copy manually from the result section."
        );
      });
  }

  /* Reset the calculator, clearing state, sessionStorage and reinitialising. */
  function handleReset() {
    if (
      !confirm(
        "Are you sure you want to reset? This will clear all inputs and results."
      )
    ) {
      return;
    }
    sessionStorage.removeItem("anna-calc-state");
    // Reset state variables
    state = {
      regulation: "2021",
      semesters: [],
      result: null,
    };
    semesterCounter = 0;
    subjectCounter = 0;
    // Remove all UI elements
    semestersContainer.innerHTML = "";
    resultDiv.innerHTML = "";
    resultSection.style.display = "none";
    // Add new default semester
    addSemester(true);
    regulationSelect.value = state.regulation;
    renderAllSemesters();
  }

  // Kick off initialisation when DOM is ready
  document.addEventListener("DOMContentLoaded", init);
})();
