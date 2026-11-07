package com.upgradeai.mobile.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.upgradeai.mobile.data.GgufModel
import com.upgradeai.mobile.data.IraqiKnowledgeRepository
import com.upgradeai.mobile.viewmodel.ChatMessage
import com.upgradeai.mobile.viewmodel.UpgradeAiViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(viewModel: UpgradeAiViewModel) {
    val messages by viewModel.messages.collectAsState()
    val models by viewModel.models.collectAsState()
    val isGenerating by viewModel.isGenerating.collectAsState()
    val activeTab by viewModel.activeTab.collectAsState()

    var inputText by remember { mutableStateOf("") }
    var knowledgeSearchQuery by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "Upgrade AI",
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        AssistChip(
                            onClick = {},
                            label = { Text("محلي • عراقي", fontSize = 11.sp) },
                            colors = AssistChipDefaults.assistChipColors(
                                containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
                            )
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = activeTab == 0,
                    onClick = { viewModel.selectTab(0) },
                    icon = { Icon(Icons.Default.Chat, contentDescription = "الدردشة") },
                    label = { Text("الدردشة") },
                    modifier = Modifier.testTag("tab_chat")
                )
                NavigationBarItem(
                    selected = activeTab == 1,
                    onClick = { viewModel.selectTab(1) },
                    icon = { Icon(Icons.Default.Memory, contentDescription = "النماذج") },
                    label = { Text("النماذج") },
                    modifier = Modifier.testTag("tab_models")
                )
                NavigationBarItem(
                    selected = activeTab == 2,
                    onClick = { viewModel.selectTab(2) },
                    icon = { Icon(Icons.Default.MenuBook, contentDescription = "المعرفة") },
                    label = { Text("المعرفة") },
                    modifier = Modifier.testTag("tab_knowledge")
                )
                NavigationBarItem(
                    selected = activeTab == 3,
                    onClick = { viewModel.selectTab(3) },
                    icon = { Icon(Icons.Default.Code, contentDescription = "دليل REA") },
                    label = { Text("دليل REA") },
                    modifier = Modifier.testTag("tab_rea")
                )
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when (activeTab) {
                0 -> ChatTabContent(
                    messages = messages,
                    isGenerating = isGenerating,
                    inputText = inputText,
                    onInputTextChange = { inputText = it },
                    onSend = {
                        viewModel.sendMessage(inputText)
                        inputText = ""
                    },
                    onApproveTool = { id, cmd -> viewModel.approveToolCommand(id, cmd) },
                    onRejectTool = { id -> viewModel.rejectToolCommand(id) }
                )
                1 -> ModelsTabContent(models = models)
                2 -> KnowledgeTabContent(
                    searchQuery = knowledgeSearchQuery,
                    onSearchQueryChange = { knowledgeSearchQuery = it }
                )
                3 -> ReaGuideTabContent()
            }
        }
    }
}

@Composable
fun ChatTabContent(
    messages: List<ChatMessage>,
    isGenerating: Boolean,
    inputText: String,
    onInputTextChange: (String) -> Unit,
    onSend: () -> Unit,
    onApproveTool: (String, String) -> Unit,
    onRejectTool: (String) -> Unit
) {
    Column(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            items(messages, key = { it.id }) { msg ->
                ChatBubble(
                    message = msg,
                    onApproveTool = { cmd -> onApproveTool(msg.id, cmd) },
                    onRejectTool = { onRejectTool(msg.id) }
                )
            }
            if (isGenerating) {
                item {
                    Row(
                        modifier = Modifier.padding(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "جاري الاستدلال محلياً...",
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.secondary
                        )
                    }
                }
            }
        }

        // Input bar
        Surface(
            tonalElevation = 3.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = inputText,
                    onValueChange = onInputTextChange,
                    placeholder = { Text("اكتب رسالتك للمساعد العراقي...") },
                    modifier = Modifier
                        .weight(1f)
                        .testTag("message_input"),
                    shape = RoundedCornerShape(24.dp),
                    maxLines = 4
                )
                Spacer(modifier = Modifier.width(8.dp))
                IconButton(
                    onClick = onSend,
                    enabled = inputText.isNotBlank() && !isGenerating,
                    modifier = Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .background(
                            if (inputText.isNotBlank() && !isGenerating)
                                MaterialTheme.colorScheme.primary
                            else
                                MaterialTheme.colorScheme.surfaceVariant
                        )
                        .testTag("send_button")
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Send,
                        contentDescription = "إرسال",
                        tint = if (inputText.isNotBlank() && !isGenerating)
                            MaterialTheme.colorScheme.onPrimary
                        else
                            MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
fun ChatBubble(
    message: ChatMessage,
    onApproveTool: (String) -> Unit,
    onRejectTool: () -> Unit
) {
    val isUser = message.sender == "user"
    val align = if (isUser) Alignment.End else Alignment.Start
    val bgColor = if (isUser) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant
    val textColor = if (isUser) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = align
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 320.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(bgColor)
                .padding(14.dp)
        ) {
            Column {
                Text(
                    text = message.text,
                    color = textColor,
                    fontSize = 14.sp,
                    lineHeight = 20.sp
                )

                // Render source citations if available
                if (message.citations.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(6.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Start
                    ) {
                        message.citations.forEach { citation ->
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = MaterialTheme.colorScheme.primary.copy(alpha = 0.2f),
                                modifier = Modifier.padding(top = 4.dp)
                            ) {
                                Text(
                                    text = citation,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }
                    }
                }

                // Render Termux Tool Approval Card if pending
                if (message.isPendingToolApproval && message.toolCommand != null) {
                    Spacer(modifier = Modifier.height(10.dp))
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surface
                        ),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(10.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Default.Terminal,
                                    contentDescription = "أمر Termux",
                                    tint = MaterialTheme.colorScheme.primary
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "أمر Termux بانتظار موافقتك",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 12.sp
                                )
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Surface(
                                color = Color.Black.copy(alpha = 0.85f),
                                shape = RoundedCornerShape(6.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(
                                    text = "$ ${message.toolCommand}",
                                    color = Color.Green,
                                    fontSize = 12.sp,
                                    modifier = Modifier.padding(8.dp)
                                )
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Button(
                                    onClick = { onApproveTool(message.toolCommand) },
                                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                                    modifier = Modifier
                                        .weight(1f)
                                        .heightIn(min = 48.dp)
                                        .testTag("approve_tool_button")
                                ) {
                                    Text("موافقة وتشغيل")
                                }
                                OutlinedButton(
                                    onClick = onRejectTool,
                                    modifier = Modifier
                                        .weight(1f)
                                        .heightIn(min = 48.dp)
                                        .testTag("reject_tool_button")
                                ) {
                                    Text("رفض")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ModelsTabContent(models: List<GgufModel>) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text(
                text = "مستكشف نماذج Hugging Face المحلية (GGUF)",
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp
            )
            Text(
                text = "نماذج تكميم Q4_K_M جاهزة للعمل محلياً عبر llama.rn بدون إنترنت.",
                fontSize = 13.sp,
                color = MaterialTheme.colorScheme.secondary
            )
        }
        items(models) { model ->
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                ),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = model.name,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            modifier = Modifier.weight(1f)
                        )
                        SuggestionChip(
                            onClick = {},
                            label = { Text(model.quantization, fontSize = 11.sp) }
                        )
                    }
                    Text(
                        text = "الناشر: ${model.publisher} • الحجم: ${model.sizeFormatted} • المتطلب: ${model.minRamRequired}",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.secondary
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = model.description,
                        fontSize = 13.sp
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    if (model.isDownloaded) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.CheckCircle,
                                contentDescription = "محمل",
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "النموذج النشط حالياً",
                                color = MaterialTheme.colorScheme.primary,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    } else {
                        Button(
                            onClick = {},
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 48.dp)
                        ) {
                            Icon(Icons.Default.Download, contentDescription = "تنزيل")
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("تنزيل النموذج (${model.sizeFormatted})")
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun KnowledgeTabContent(
    searchQuery: String,
    onSearchQueryChange: (String) -> Unit
) {
    val results = remember(searchQuery) {
        if (searchQuery.isBlank()) IraqiKnowledgeRepository.records
        else IraqiKnowledgeRepository.search(searchQuery).map { it.record }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text(
            text = "قاعدة المعرفة العراقية المحلية (RAG VectorDB)",
            fontWeight = FontWeight.Bold,
            fontSize = 16.sp
        )
        Text(
            text = "سجلات موثقة للهجة والتراث العراقي لتقليل الهلوسة والرجوع إليها كمصادر.",
            fontSize = 13.sp,
            color = MaterialTheme.colorScheme.secondary
        )
        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = searchQuery,
            onValueChange = onSearchQueryChange,
            placeholder = { Text("بحث في قاعدة المعرفة...") },
            modifier = Modifier.fillMaxWidth(),
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = "بحث") },
            shape = RoundedCornerShape(12.dp)
        )
        Spacer(modifier = Modifier.height(12.dp))

        LazyColumn(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            items(results) { record ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant
                    )
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = record.title,
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp
                            )
                            Text(
                                text = record.category,
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = record.content,
                            fontSize = 13.sp,
                            lineHeight = 18.sp
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun ReaGuideTabContent() {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Text(
                text = "دليل دمج واستخدام REA بالعربية العراقية",
                fontWeight = FontWeight.Bold,
                fontSize = 18.sp,
                color = MaterialTheme.colorScheme.primary
            )
            Text(
                text = "أداة الهندسة العكسية وتحليل الملفات الثنائية (morluto/rea)",
                fontSize = 13.sp,
                color = MaterialTheme.colorScheme.secondary
            )
        }
        item {
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                ),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "1. شنو هي أداة REA؟",
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "أداة REA هي خادم MCP وأداة سطر أوامر لحاسوب المطور لربط أدوات الهندسة العكسية العميقة مثل Ghidra و Hopper و objdump بمساعد الذكاء الاصطناعي. REA مو نموذج توليد ومو محرك استدلال، وما تعالج الهلوسة بحد ذاتها.",
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }
        }
        item {
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                ),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "2. هل تكدر تشغلها داخل الـ APK؟",
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "مستحيل تقنياً وغير آمن داخل أندرويد لأنها تحتاج Node.js 22+ وبرامج ديسكتوب مثل Ghidra و GDB. التوصية المعمارية الصحيحة هي تشغيلها على جهاز المطور وربطها بالمساعد عبر سير العمل الخارجي فقط.",
                        fontSize = 13.sp
                    )
                }
            }
        }
        item {
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                ),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "3. أوامر الإعداد والاستخدام والمسح",
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "التثبيت والإعداد بالـ MCP:\nnpx rea-agents setup\n\nفحص الرموز والمكتبات:\nnpx rea inspect path/to/libllama.so\n\nإزالة الأداة بالكامل:\nnpx rea-agents remove",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }
    }
}
