package com.upgradeai.mobile.data

data class IraqiKnowledgeRecord(
    val id: String,
    val category: String,
    val title: String,
    val content: String
)

data class RetrievalResult(
    val record: IraqiKnowledgeRecord,
    val score: Float,
    val citationTag: String
)

object IraqiKnowledgeRepository {
    val records: List<IraqiKnowledgeRecord> = listOf(
        IraqiKnowledgeRecord(
            id = "greetings",
            category = "conversation",
            title = "تحيات يومية وردود عراقية",
            content = "تحيات عراقية يومية: «هلا» و«هلا بيك» للترحيب، «شلونك؟» للرجل و«شلونچ؟» للمرأة، و«شلونكم؟» للجمع. من الأجوبة الشائعة «زين، الحمد لله»، «تمام» و«بخير». «صباح الخير» و«مساء الخير» مستخدمتان أيضاً."
        ),
        IraqiKnowledgeRecord(
            id = "question-words",
            category = "vocabulary",
            title = "كلمات السؤال الشائعة",
            content = "كلمات السؤال الشائعة باللهجة العراقية: «شنو؟» ماذا، «شلون؟» كيف، «وين؟» أين، «ليش؟» لماذا، «منو؟» مَن، «شكد؟» كم، «يمتى؟» متى، «ياهو؟» أيّ واحد."
        ),
        IraqiKnowledgeRecord(
            id = "gaf-letter",
            category = "regional-variation",
            title = "استخدام حرف الگ (g)",
            content = "في كتابة اللهجة العراقية تُستعمل «گ» لصوت g مثل «أگدر» (أستطيع) و«گلب» (قلب)، ويكتبها آخرون «ق» أو «ك». افهم المقصود من السياق ولا تفرض تهجئة واحدة."
        ),
        IraqiKnowledgeRecord(
            id = "ch-letter",
            category = "regional-variation",
            title = "استخدام حرف چ (ch)",
            content = "تُستخدم «چ» لتمثيل صوت ch في مثل «شلونچ؟» لمخاطبة الأنثى، و«عليچ» بمعنى عليكِ. استخدامها طبيعي ومحبب بالتواصل العراقي."
        ),
        IraqiKnowledgeRecord(
            id = "common-phrases",
            category = "vocabulary",
            title = "عبارات متداولة",
            content = "«ما يخالف» تعني لا بأس وموافق، «خوش» تفيد المدح والجودة (خوش ولد، خوش فكرة)، «لعد» تعني إذاً أو إذن، «فد» أداة تنكير وتخصيص (فد شي، فد واحد)."
        ),
        IraqiKnowledgeRecord(
            id = "culture-tea",
            category = "culture",
            title = "ثقافة الچاي العراقي",
            content = "الچاي العراقي يُحضّر مخمّراً على القوري المهيّل وبنكهة الهيل ويُقدّم في استكانة الشاي الزجاجية ذات الخصر، وهو رمز الضيافة الأول."
        ),
        IraqiKnowledgeRecord(
            id = "culture-masgouf",
            category = "culture",
            title = "المسگوف البغدادي",
            content = "المسگوف هو أشهر طبق سمك عراقي تقليدي يُشوى على الحطب بطريقة دائرية خاصة في شارع أبي نواس وبغداد وعموم العراق."
        ),
        IraqiKnowledgeRecord(
            id = "upgrade-architecture",
            category = "project",
            title = "بنية Upgrade AI التقنية",
            content = "تطبيق Upgrade AI يوفر استدلال محلي بالكامل لنماذج GGUF عبر llama.rn، ودعم RTL والعربية العراقية، وتخزين VectorDB محلي، وأدوات Termux بموافقة بشرية صريحة."
        )
    )

    fun search(query: String): List<RetrievalResult> {
        val q = query.trim().lowercase()
        if (q.isBlank()) return emptyList()

        val tokens = q.split("\\s+".toRegex()).filter { it.length > 2 }
        return records.mapNotNull { record ->
            val text = (record.title + " " + record.content).lowercase()
            var matches = 0
            for (token in tokens) {
                if (text.contains(token)) matches++
            }
            if (matches > 0 || text.contains(q)) {
                val score = (matches.toFloat() / (tokens.size.coerceAtLeast(1)))
                    .coerceIn(0.5f, 1.0f)
                RetrievalResult(
                    record = record,
                    score = score,
                    citationTag = "[Source: ${record.title}]"
                )
            } else null
        }.sortedByDescending { it.score }
    }
}
