package com.phototracker.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Ink = Color(0xFF1F2320)
val Muted = Color(0xFF5D645F)
val Paper = Color(0xFFF7F4EF)
val Panel = Color(0xFFFFFFFF)
val Line = Color(0xFFD7D0C5)
val Accent = Color(0xFF2F695C)
val AccentStrong = Color(0xFF184A40)
val Warm = Color(0xFFC67445)
val Danger = Color(0xFFC0392B)

private val LightColorScheme = lightColorScheme(
    primary = AccentStrong,
    onPrimary = Panel,
    primaryContainer = Color(0xFFB2DFDB),
    onPrimaryContainer = AccentStrong,
    secondary = Accent,
    onSecondary = Panel,
    secondaryContainer = Color(0xFFD4E8E4),
    onSecondaryContainer = AccentStrong,
    tertiary = Warm,
    onTertiary = Panel,
    background = Paper,
    onBackground = Ink,
    surface = Panel,
    onSurface = Ink,
    surfaceVariant = Color(0xFFF0EDE8),
    onSurfaceVariant = Muted,
    outline = Line,
    error = Danger,
    onError = Panel,
)

private val DarkColorScheme = darkColorScheme(
    primary = Color(0xFF80CBC4),
    onPrimary = Color(0xFF00363A),
    primaryContainer = AccentStrong,
    onPrimaryContainer = Color(0xFFB2DFDB),
    secondary = Color(0xFF80CBC4),
    onSecondary = Color(0xFF00363A),
    tertiary = Color(0xFFFFAB76),
    onTertiary = Color(0xFF4A2800),
    background = Color(0xFF1A1C1B),
    onBackground = Color(0xFFE1E3E0),
    surface = Color(0xFF1A1C1B),
    onSurface = Color(0xFFE1E3E0),
    surfaceVariant = Color(0xFF3F4945),
    onSurfaceVariant = Color(0xFFBEC9C4),
    outline = Color(0xFF899390),
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005),
)

@Composable
fun PhototrackerTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
