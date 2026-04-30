package com.phototracker.ui.navigation

sealed class Screen(val route: String) {
    object Login : Screen("login")
    object Register : Screen("register")
    object Home : Screen("home")
    object Photos : Screen("photos")
    object Rolls : Screen("rolls")
    object Gear : Screen("gear")
    object AddPhoto : Screen("add_photo")
    object PhotoDetail : Screen("photo_detail/{id}") {
        fun createRoute(id: String) = "photo_detail/$id"
    }
}
