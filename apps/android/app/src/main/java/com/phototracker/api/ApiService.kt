package com.phototracker.api

import com.phototracker.data.model.*
import okhttp3.MultipartBody
import retrofit2.Response
import retrofit2.http.*

interface ApiService {
    @GET("api/health")
    suspend fun getHealth(): Response<Map<String, Any>>

    // Auth
    @POST("api/auth/register")
    suspend fun register(@Body body: Map<String, String>): Response<AuthResponse>

    @POST("api/auth/login")
    suspend fun login(@Body body: Map<String, String>): Response<AuthResponse>

    @GET("api/auth/me")
    suspend fun getMe(): Response<User>

    // Gear: Cameras
    @GET("api/gear/cameras")
    suspend fun listCameras(
        @Query("limit") limit: Int? = null,
        @Query("offset") offset: Int? = null
    ): Response<ListResponse<Camera>>

    @POST("api/gear/cameras")
    suspend fun createCamera(@Body body: Map<String, String?>): Response<Camera>

    @GET("api/gear/cameras/{id}")
    suspend fun getCamera(@Path("id") id: String): Response<Camera>

    @PATCH("api/gear/cameras/{id}")
    suspend fun updateCamera(@Path("id") id: String, @Body body: Map<String, String?>): Response<Camera>

    @DELETE("api/gear/cameras/{id}")
    suspend fun deleteCamera(@Path("id") id: String): Response<Unit>

    // Gear: Lenses
    @GET("api/gear/lenses")
    suspend fun listLenses(
        @Query("limit") limit: Int? = null,
        @Query("offset") offset: Int? = null
    ): Response<ListResponse<Lens>>

    @POST("api/gear/lenses")
    suspend fun createLens(@Body body: Map<String, Any?>): Response<Lens>

    @GET("api/gear/lenses/{id}")
    suspend fun getLens(@Path("id") id: String): Response<Lens>

    @PATCH("api/gear/lenses/{id}")
    suspend fun updateLens(@Path("id") id: String, @Body body: Map<String, Any?>): Response<Lens>

    @DELETE("api/gear/lenses/{id}")
    suspend fun deleteLens(@Path("id") id: String): Response<Unit>

    // Gear: Film Stocks
    @GET("api/gear/films")
    suspend fun listFilmStocks(
        @Query("limit") limit: Int? = null,
        @Query("offset") offset: Int? = null
    ): Response<ListResponse<FilmStock>>

    @POST("api/gear/films")
    suspend fun createFilmStock(@Body body: Map<String, Any?>): Response<FilmStock>

    @GET("api/gear/films/{id}")
    suspend fun getFilmStock(@Path("id") id: String): Response<FilmStock>

    @PATCH("api/gear/films/{id}")
    suspend fun updateFilmStock(@Path("id") id: String, @Body body: Map<String, Any?>): Response<FilmStock>

    @DELETE("api/gear/films/{id}")
    suspend fun deleteFilmStock(@Path("id") id: String): Response<Unit>

    // Gear: Film Holders
    @GET("api/gear/film_holders")
    suspend fun listFilmHolders(
        @Query("limit") limit: Int? = null,
        @Query("offset") offset: Int? = null
    ): Response<ListResponse<FilmHolder>>

    @POST("api/gear/film_holders")
    suspend fun createFilmHolder(@Body body: Map<String, Any?>): Response<FilmHolder>

    @GET("api/gear/film_holders/{id}")
    suspend fun getFilmHolder(@Path("id") id: String): Response<FilmHolder>

    @PATCH("api/gear/film_holders/{id}")
    suspend fun updateFilmHolder(@Path("id") id: String, @Body body: Map<String, Any?>): Response<FilmHolder>

    @DELETE("api/gear/film_holders/{id}")
    suspend fun deleteFilmHolder(@Path("id") id: String): Response<Unit>

    // Rolls
    @GET("api/rolls")
    suspend fun listRolls(
        @Query("limit") limit: Int? = null,
        @Query("offset") offset: Int? = null,
        @Query("film_id") filmId: String? = null
    ): Response<ListResponse<Roll>>

    @POST("api/rolls")
    suspend fun createRoll(@Body body: Map<String, String?>): Response<Roll>

    @GET("api/rolls/{id}")
    suspend fun getRoll(@Path("id") id: String): Response<Roll>

    @PATCH("api/rolls/{id}")
    suspend fun updateRoll(@Path("id") id: String, @Body body: Map<String, String?>): Response<Roll>

    @DELETE("api/rolls/{id}")
    suspend fun deleteRoll(@Path("id") id: String): Response<Unit>

    // Photographs
    @GET("api/photographs")
    suspend fun listPhotographs(
        @Query("limit") limit: Int? = null,
        @Query("offset") offset: Int? = null,
        @Query("roll_id") rollId: String? = null,
        @Query("camera_id") cameraId: String? = null,
        @Query("lens_id") lensId: String? = null,
        @Query("film_id") filmId: String? = null
    ): Response<ListResponse<Photograph>>

    @POST("api/photographs")
    suspend fun createPhotograph(@Body body: Map<String, Any?>): Response<Photograph>

    @GET("api/photographs/{id}")
    suspend fun getPhotograph(@Path("id") id: String): Response<Photograph>

    @PATCH("api/photographs/{id}")
    suspend fun updatePhotograph(@Path("id") id: String, @Body body: Map<String, Any?>): Response<Photograph>

    @DELETE("api/photographs/{id}")
    suspend fun deletePhotograph(@Path("id") id: String): Response<Unit>

    // Photograph Images
    @GET("api/photographs/{id}/images")
    suspend fun listPhotographImages(@Path("id") id: String): Response<Map<String, List<PhotographImage>>>

    @Multipart
    @POST("api/photographs/{id}/images")
    suspend fun uploadPhotographImage(
        @Path("id") id: String,
        @Part file: MultipartBody.Part
    ): Response<PhotographImage>

    @DELETE("api/photographs/{id}/images/{image_id}")
    suspend fun deletePhotographImage(
        @Path("id") id: String,
        @Path("image_id") imageId: String
    ): Response<Unit>
}
