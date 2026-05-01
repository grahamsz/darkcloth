package com.phototracker.data.model

import com.google.gson.annotations.SerializedName

data class User(
    val id: String,
    val email: String,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("updated_at") val updatedAt: String
)

data class AuthResponse(
    val token: String,
    val user: User
)

data class ErrorResponse(
    val error: String
)

data class Camera(
    val id: String,
    @SerializedName("user_id") val userId: String,
    val name: String,
    val maker: String?,
    @SerializedName("created_at") val createdAt: String
)

data class Lens(
    val id: String,
    @SerializedName("user_id") val userId: String,
    val name: String,
    @SerializedName("focal_length_mm") val focalLengthMm: Double?,
    @SerializedName("max_aperture") val maxAperture: String?,
    @SerializedName("created_at") val createdAt: String
)

data class FilmStock(
    val id: String,
    @SerializedName("user_id") val userId: String,
    val name: String,
    val iso: Int?,
    val process: String?,
    @SerializedName("created_at") val createdAt: String
)

data class FilmHolder(
    val id: String,
    @SerializedName("user_id") val userId: String,
    val name: String,
    val type: String,
    @SerializedName("width_mm") val widthMm: Double?,
    @SerializedName("height_mm") val heightMm: Double?,
    val brand: String?,
    val capacity: Int?,
    @SerializedName("created_at") val createdAt: String
)

data class Roll(
    val id: String,
    @SerializedName("user_id") val userId: String,
    @SerializedName("film_id") val filmId: String?,
    val name: String,
    @SerializedName("loaded_at") val loadedAt: String?,
    @SerializedName("developed_at") val developedAt: String?,
    @SerializedName("created_at") val createdAt: String
)

data class Photograph(
    val id: String,
    @SerializedName("user_id") val userId: String,
    @SerializedName("roll_id") val rollId: String?,
    @SerializedName("camera_id") val cameraId: String?,
    @SerializedName("lens_id") val lensId: String?,
    @SerializedName("film_id") val filmId: String?,
    @SerializedName("film_holder_id") val filmHolderId: String?,
    @SerializedName("frame_number") val frameNumber: String?,
    @SerializedName("taken_at") val takenAt: String?,
    val aperture: String?,
    @SerializedName("shutter_speed") val shutterSpeed: String?,
    val iso: Int?,
    @SerializedName("exposure_compensation") val exposureCompensation: String?,
    @SerializedName("focal_length_mm") val focalLengthMm: Double?,
    val latitude: Double?,
    val longitude: Double?,
    @SerializedName("altitude_m") val altitudeM: Double?,
    @SerializedName("gps_accuracy_m") val gpsAccuracyM: Double?,
    val notes: String?,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("updated_at") val updatedAt: String
)

data class PhotographImage(
    val id: String,
    @SerializedName("photograph_id") val photographId: String,
    @SerializedName("content_type") val contentType: String,
    val width: Int?,
    val height: Int?,
    @SerializedName("original_filename") val originalFilename: String?,
    val url: String?,
    @SerializedName("created_at") val createdAt: String
)

data class ListResponse<T>(
    val items: List<T>,
    val total: Int
)
