document.addEventListener("DOMContentLoaded", () => {
    const chatBox = document.getElementById("chat-box");
    const userInput = document.getElementById("user-input");
    const analyzeBtn = document.getElementById("analyze-btn");
    const sendBtn = document.getElementById("send-btn");
    const clearBtn = document.getElementById("clear-btn");
    const themeBtn = document.getElementById("theme-btn");
    const apiStatus = document.getElementById("api-status");
    const geminiStatus = document.getElementById("gemini-status");
    const feedbackCount = document.getElementById("feedback-count");
    const retrainBtn = document.getElementById("retrain-btn");
    const retrainStatus = document.getElementById("retrain-status");
    const charCount = document.getElementById("char-count");
    const sampleButtons = document.querySelectorAll(".sample-btn");

    const liveVerdict = document.getElementById("live-verdict");
    const publicDemo = document.getElementById("research3-public-bot-demo-v1") !== null;
    document.getElementById("review-controls").hidden = publicDemo;
    const spectrumBand = document.querySelector(".spectrum-ambiguous-band");
    const spectrumCaption = document.getElementById("spectrum-caption");
    const spectrumMarker = document.getElementById("spectrum-marker");
    const statLiteral = document.getElementById("stat-literal");
    const statAmbiguous = document.getElementById("stat-ambiguous");
    const statSarcastic = document.getElementById("stat-sarcastic");
    const pipes = [1, 2, 3, 4].map((i) => document.getElementById(`pipe-${i}`));

    let busy = false;
    const sessionCounts = { literal: 0, ambiguous: 0, sarcastic: 0 };

    const formatPercent = (value) => `${Math.round(Number(value || 0) * 100)}%`;
    const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    function updateCounter() { charCount.textContent = `${userInput.value.length} / 8000`; }
    function setBusy(value) {
        busy = value;
        analyzeBtn.disabled = value;
        sendBtn.disabled = value;
        userInput.disabled = value;
        clearBtn.disabled = value;
    }

    function setPipeline(activeStep, doneUpTo) {
        pipes.forEach((el, idx) => {
            if (!el) return;
            const step = idx + 1;
            el.classList.toggle("is-active", step === activeStep);
            el.classList.toggle("is-done", step <= doneUpTo && step !== activeStep);
        });
    }

    function updateInspector(score, label, isSarcastic) {
        const normalized = String(label || "").toLowerCase();
        const insufficient = normalized === "insufficient context";
        const numericScore = typeof score === "number" && Number.isFinite(score);
        if (spectrumMarker) {
            spectrumMarker.style.left = `${Math.max(0, Math.min(100, score * 100))}%`;
            spectrumMarker.classList.toggle("active", numericScore && !insufficient);
        }
        const isSarc = isSarcastic === true || normalized === "sarcastic";
        const isLit = isSarcastic === false || normalized === "not sarcastic";

        if (liveVerdict) {
            liveVerdict.textContent = numericScore && !insufficient
                ? `${formatPercent(score)} · ${label || "Evaluated"}`
                : (label || "Score unavailable");
            liveVerdict.className = "verdict-chip";
            if (isSarc) liveVerdict.classList.add("is-sarcastic");
            else if (isLit) liveVerdict.classList.add("is-literal");
            else if (normalized === "ambiguous") liveVerdict.classList.add("is-ambiguous");
        }

        if (isSarc) sessionCounts.sarcastic += 1;
        else if (isLit) sessionCounts.literal += 1;
        else if (normalized === "ambiguous") sessionCounts.ambiguous += 1;

        if (statLiteral) statLiteral.textContent = String(sessionCounts.literal);
        if (statAmbiguous) statAmbiguous.textContent = String(sessionCounts.ambiguous);
        if (statSarcastic) statSarcastic.textContent = String(sessionCounts.sarcastic);
    }

    function addMessageActions(container, text) {
        const meta = document.createElement("div");
        meta.className = "message-meta";
        const time = document.createElement("span");
        time.textContent = now();
        const copy = document.createElement("button");
        copy.type = "button";
        copy.className = "copy-btn";
        copy.textContent = "Copy";
        copy.addEventListener("click", async () => {
            try { await navigator.clipboard.writeText(text); copy.textContent = "Copied"; }
            catch { copy.textContent = "Copy failed"; }
            setTimeout(() => { copy.textContent = "Copy"; }, 1200);
        });
        meta.append(time, copy);
        container.appendChild(meta);
    }

    function resultLabel(scores, prefix) {
        return scores[`${prefix}_label`] || (scores[`${prefix}_is_sarcastic`] === true ? "Sarcastic" : scores[`${prefix}_is_sarcastic`] === false ? "Not sarcastic" : "Ambiguous");
    }

    function createMetricPanel(title, score, label, confidence) {
        const panel = document.createElement("div");
        panel.className = "metric-panel";

        const line = document.createElement("div");
        line.className = "result-line";
        const name = document.createElement("span");
        name.className = "result-label";
        name.textContent = title;
        const big = document.createElement("span");
        big.className = "result-score-big";
        big.textContent = formatPercent(score);
        line.append(name, big);

        const sub = document.createElement("div");
        sub.className = "result-sub";
        sub.textContent = `${label} · ${confidence || "—"} confidence`;

        const track = document.createElement("div");
        track.className = "meter-track";
        const fill = document.createElement("div");
        fill.className = "meter-fill";
        const lower = String(label || "").toLowerCase();
        if (lower === "sarcastic") fill.classList.add("is-sarcastic");
        else if (lower !== "not sarcastic") fill.classList.add("is-ambiguous");
        fill.style.width = `${Math.max(4, Math.round(Number(score || 0) * 100))}%`;
        track.appendChild(fill);

        panel.append(line, sub, track);
        return panel;
    }

    function sourceBadge(source) {
        const badge = document.createElement("span");
        const normalized = (source || "Analyze only").toLowerCase();
        badge.className = "source-badge";
        if (normalized.includes("gemini")) badge.classList.add("source-gemini");
        else if (normalized.includes("fallback")) badge.classList.add("source-fallback");
        else badge.classList.add("source-analysis");
        badge.textContent = source || "Analyze only";
        return badge;
    }

    function createFeedbackPanel(context) {
        const panel = document.createElement("div");
        panel.className = "feedback-panel";

        const prompt = document.createElement("span");
        prompt.textContent = "Is this prediction incorrect?";

        const incorrect = document.createElement("button");
        incorrect.type = "button";
        incorrect.className = "feedback-incorrect";
        incorrect.textContent = "Correct this result";

        const correction = document.createElement("div");
        correction.className = "correction-panel";
        correction.hidden = true;
        correction.innerHTML = `
            <label>Correct label
                <select>
                    <option value="not_sarcastic">Not sarcastic</option>
                    <option value="sarcastic">Sarcastic</option>
                    <option value="insufficient_context">Insufficient context</option>
                </select>
            </label>
            <button type="button" class="save-correction">Save correction</button>
            <span class="feedback-message" aria-live="polite"></span>`;

        incorrect.addEventListener("click", () => {
            const isOpen = !correction.hidden;
            correction.hidden = isOpen;
            incorrect.textContent = isOpen ? "Correct this result" : "Cancel correction";
        });

        correction.querySelector(".save-correction").addEventListener("click", async () => {
            const message = correction.querySelector(".feedback-message");
            try {
                const data = await postJson("/feedback", {
                    text: context.text,
                    predicted_label: context.label,
                    predicted_score: context.score,
                    correct_label: correction.querySelector("select").value,
                    source: context.source || "analyze"
                });

                prompt.textContent = "Correction saved for the next retraining cycle.";
                message.textContent = data.message || "Saved.";
                feedbackCount.textContent = data.feedback_count;
                incorrect.disabled = true;
                correction.querySelector("button").disabled = true;
                correction.querySelector("select").disabled = true;
            } catch (error) {
                message.textContent = error.message;
            }
        });

        panel.append(prompt, incorrect, correction);
        return panel;
    }

    function createScoreCard(scores, feedbackContext = null) {
        const card = document.createElement("div");
        card.className = "score-card";
        const hasReply = scores.reply_sarcasm_score !== undefined;
        const grid = document.createElement("div");
        grid.className = `compare-grid ${hasReply ? "" : "single"}`.trim();

        if (scores.user_sarcasm_score !== undefined) {
            grid.appendChild(createMetricPanel("Your text", scores.user_sarcasm_score, resultLabel(scores, "user"), scores.user_confidence));
        }
        if (hasReply) {
            grid.appendChild(createMetricPanel("Generated reply", scores.reply_sarcasm_score, resultLabel(scores, "reply"), scores.reply_confidence));
        }
        if (grid.childNodes.length) card.appendChild(grid);

        if (scores.user_explanation) {
            const explanation = document.createElement("p");
            explanation.className = "explanation";
            explanation.textContent = scores.user_explanation;
            card.appendChild(explanation);
        }
        if (feedbackContext && !publicDemo) card.appendChild(createFeedbackPanel(feedbackContext));

        const row = document.createElement("div");
        row.className = "source-row";
        const label = document.createElement("span");
        label.className = "result-label";
        label.textContent = "Response source";
        row.append(label, sourceBadge(scores.response_source));
        card.appendChild(row);

        const fallback = scores.fallback_message || scores.fallback_reason;
        if (fallback) {
            const note = document.createElement("p");
            note.className = "fallback-note";
            note.textContent = fallback;
            card.appendChild(note);
        }
        return card;
    }

    function appendMessage(text, sender, scores = null, variant = "", feedbackContext = null) {
        const wrapper = document.createElement("div");
        wrapper.className = `message ${sender === "user" ? "user-message" : "bot-message"}`;
        const bubble = document.createElement("div");
        bubble.className = `bubble ${variant}`.trim();
        bubble.textContent = text;
        wrapper.appendChild(bubble);
        if (scores) wrapper.appendChild(createScoreCard(scores, feedbackContext));
        addMessageActions(wrapper, text);
        chatBox.appendChild(wrapper);
        chatBox.scrollTop = chatBox.scrollHeight;
        if (feedbackContext) {
            requestAnimationFrame(() => {
                const panel = wrapper.querySelector(".feedback-panel");
                panel?.scrollIntoView({ behavior: "smooth", block: "center" });
            });
        }
    }

    function showTyping(label) {
        const item = document.createElement("div");
        item.id = "active-typing-indicator";
        item.className = "message bot-message";
        item.innerHTML = `<div class="bubble typing-indicator"><span>${label}</span><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>`;
        chatBox.appendChild(item);
        chatBox.scrollTop = chatBox.scrollHeight;
    }
    function removeTyping() { document.getElementById("active-typing-indicator")?.remove(); }

    function normalizeApiError(data, status) {
        if (Array.isArray(data.detail)) return data.detail.map(x => x.msg).filter(Boolean).join(" ");
        if (typeof data.detail === "string") return data.detail;
        return status >= 500 ? "The server could not complete the request." : `Request failed (${status}).`;
    }

    async function postJson(url, body = {}) {
        let response;
        try { response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
        catch { throw new Error("Cannot reach the FastAPI server."); }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(normalizeApiError(data, response.status));
        return data;
    }

    async function loadHealth() {
        try {
            const response = await fetch("/health");
            if (!response.ok) throw new Error(`Health check failed (${response.status})`);
            const data = await response.json();
            const low = data.ambiguous_low;
            const high = data.ambiguous_high;
            if (Number.isFinite(low) && Number.isFinite(high) && low >= 0 && low < high && high <= 1) {
                spectrumBand.style.left = `${low * 100}%`;
                spectrumBand.style.width = `${(high - low) * 100}%`;
                spectrumBand.hidden = false;
                spectrumCaption.textContent = "Ambiguous zone";
            }
            const ready = data.model_ready && data.tokenizer_ready;
            apiStatus.textContent = ready ? "Ready" : "Needs setup";
            apiStatus.className = ready ? "status-ok" : "status-warn";
            geminiStatus.textContent = data.gemini_configured ? `Configured · ${data.gemini_model}` : "Local fallback";
            geminiStatus.className = data.gemini_configured ? "status-ok" : "status-warn";
            feedbackCount.textContent = data.feedback_count || 0;
            retrainBtn.disabled = publicDemo || !data.retraining_available;
            retrainStatus.textContent = data.retraining_available ? (data.retraining_status?.message || "Ready for controlled retraining.") : "Retraining is unavailable for this release.";
        } catch {
            apiStatus.textContent = "Offline";
            apiStatus.className = "status-error";
        }
    }

    function updateGemini(data) {
        if (data.response_source === "Gemini") {
            geminiStatus.textContent = "Active · Gemini";
            geminiStatus.className = "status-ok";
        } else {
            const labels = {
                quota_error: "Quota unavailable · fallback active",
                authentication_error: "API key problem · fallback active",
                model_unavailable: "Model unavailable · fallback active",
                service_unavailable: "Service unavailable · fallback active"
            };
            geminiStatus.textContent = labels[data.fallback_code] || "Fallback active";
            geminiStatus.className = "status-warn";
        }
    }

    const inputFeedback = document.createElement("p");
    inputFeedback.id = "input-feedback";
    inputFeedback.setAttribute("role", "alert");
    inputFeedback.hidden = true;
    userInput.insertAdjacentElement("afterend", inputFeedback);
    userInput.setAttribute("aria-describedby", "input-help input-feedback");

    function clearInputFeedback() {
        inputFeedback.textContent = "";
        inputFeedback.hidden = true;
        userInput.removeAttribute("aria-invalid");
    }

    userInput.addEventListener("input", () => {
        if (userInput.value.trim()) clearInputFeedback();
    });

    function getText() {
        const text = userInput.value.trim();
        if (!text) {
            inputFeedback.textContent = "Enter some text or choose an example, then select Analyze only or Generate reply.";
            inputFeedback.hidden = false;
            userInput.setAttribute("aria-invalid", "true");
            userInput.focus();
            return null;
        }
        clearInputFeedback();
        return text;
    }

    async function analyzeOnly() {
        const text = getText(); if (!text || busy) return;
        appendMessage(text, "user"); setBusy(true); setPipeline(2, 1); showTyping("Analyzing");
        try {
            const data = await postJson("/analyze", { message: text });
            removeTyping();
            setPipeline(0, 2);
            updateInspector(data.score, data.label, data.is_sarcastic);
            appendMessage(`Analysis complete: ${data.label}.`, "bot", {
                user_sarcasm_score: data.score,
                user_is_sarcastic: data.is_sarcastic,
                user_label: data.label,
                user_confidence: data.confidence,
                user_explanation: data.explanation,
                response_source: "Analyze only"
            }, "", { text, label: data.label, score: data.score, source: "analyze" });
            updateCounter();
        } catch (error) { removeTyping(); setPipeline(0, 0); appendMessage(error.message, "bot", null, "error-bubble"); }
        finally { setBusy(false); userInput.focus(); }
    }

    async function generateReply() {
        const text = getText(); if (!text || busy) return;
        appendMessage(text, "user"); userInput.value = ""; updateCounter(); setBusy(true); setPipeline(2, 1); showTyping("Generating reply");
        try {
            const data = await postJson("/chat", { message: text });
            removeTyping();
            setPipeline(0, 4);
            updateInspector(data.user_sarcasm_score, resultLabel(data, "user"), data.user_is_sarcastic);
            appendMessage(data.reply, "bot", data, "", { text, label: data.user_label, score: data.user_sarcasm_score, source: "chat" });
            updateGemini(data);
        } catch (error) { removeTyping(); setPipeline(0, 0); appendMessage(error.message, "bot", null, "error-bubble"); }
        finally { setBusy(false); userInput.focus(); }
    }

    async function retrain() {
        retrainBtn.disabled = true;
        retrainStatus.textContent = "Starting candidate retraining...";
        try {
            const data = await postJson("/admin/retrain");
            retrainStatus.textContent = data.message;
        } catch (error) {
            retrainStatus.textContent = error.message;
            retrainBtn.disabled = false;
        }
    }

    function resetChat() {
        chatBox.innerHTML = "";
        sessionCounts.literal = 0;
        sessionCounts.ambiguous = 0;
        sessionCounts.sarcastic = 0;
        if (statLiteral) statLiteral.textContent = "0";
        if (statAmbiguous) statAmbiguous.textContent = "0";
        if (statSarcastic) statSarcastic.textContent = "0";
        if (liveVerdict) {
            liveVerdict.textContent = "Awaiting input";
            liveVerdict.className = "verdict-chip";
        }
        if (spectrumMarker) {
            spectrumMarker.style.left = "50%";
            spectrumMarker.classList.remove("active");
        }
        setPipeline(0, 0);
        appendMessage("Paste a short headline or message. I will estimate whether it is sarcastic, ambiguous, or too short to judge. Generate uses Gemini when available.", "bot");
    }

    sendBtn.addEventListener("click", generateReply);
    analyzeBtn.addEventListener("click", analyzeOnly);
    retrainBtn.addEventListener("click", retrain);
    clearBtn.addEventListener("click", resetChat);
    themeBtn.addEventListener("click", () => {
        document.body.classList.toggle("light-theme");
        themeBtn.textContent = document.body.classList.contains("light-theme") ? "☾" : "☀";
    });
    userInput.addEventListener("input", updateCounter);
    userInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); generateReply(); }
    });
    sampleButtons.forEach(button => button.addEventListener("click", () => {
        userInput.value = button.dataset.sample; updateCounter(); clearInputFeedback(); userInput.focus();
    }));

    resetChat(); updateCounter(); loadHealth(); userInput.focus();
});
