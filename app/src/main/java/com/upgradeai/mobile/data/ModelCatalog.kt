package com.upgradeai.mobile.data

data class GgufModel(
    val id: String,
    val name: String,
    val publisher: String,
    val quantization: String,
    val sizeBytes: Long,
    val sizeFormatted: String,
    val minRamRequired: String,
    val isDownloaded: Boolean = false,
    val description: String
)

object ModelCatalog {
    val models: List<GgufModel> = listOf(
        GgufModel(
            id = "llama-3.2-3b-q4",
            name = "Llama 3.2 3B Instruct (Iraqi Preset)",
            publisher = "meta-llama",
            quantization = "Q4_K_M",
            sizeBytes = 2_020_000_000L,
            sizeFormatted = "2.02 GB",
            minRamRequired = "4 GB RAM",
            isDownloaded = true,
            description = "النموذج المحلي المعتمد للدردشة والمساعد العراقي، متوازن السرعة والدقة."
        ),
        GgufModel(
            id = "qwen2.5-1.5b-q4",
            name = "Qwen 2.5 1.5B Instruct",
            publisher = "Qwen",
            quantization = "Q4_K_M",
            sizeBytes = 980_000_000L,
            sizeFormatted = "980 MB",
            minRamRequired = "2 GB RAM",
            isDownloaded = false,
            description = "فائق السرعة وخفيف جداً على الأجهزة الاقتصادية وذات الذاكرة المحدودة."
        ),
        GgufModel(
            id = "mistral-7b-v0.3-q4",
            name = "Mistral 7B Instruct v0.3",
            publisher = "mistralai",
            quantization = "Q4_K_M",
            sizeBytes = 4_370_000_000L,
            sizeFormatted = "4.37 GB",
            minRamRequired = "8 GB RAM",
            isDownloaded = false,
            description = "قدرات استنتاج وبرمجة متقدمة للأجهزة الرائدة (Flagship Devices)."
        ),
        GgufModel(
            id = "gemma-2-2b-q4",
            name = "Gemma 2 2B IT",
            publisher = "google",
            quantization = "Q4_K_M",
            sizeBytes = 1_650_000_000L,
            sizeFormatted = "1.65 GB",
            minRamRequired = "3 GB RAM",
            isDownloaded = false,
            description = "نموذج جوجل المصغر، سريع ومناسب للتلخيص واستخراج المعطيات."
        )
    )
}
