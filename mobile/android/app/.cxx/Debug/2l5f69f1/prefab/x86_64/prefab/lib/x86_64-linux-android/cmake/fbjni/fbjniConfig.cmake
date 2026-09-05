if(NOT TARGET fbjni::fbjni)
add_library(fbjni::fbjni SHARED IMPORTED)
set_target_properties(fbjni::fbjni PROPERTIES
    IMPORTED_LOCATION "E:/gradle-cache/caches/8.13/transforms/d1b1ebd4f68363262eec283220efc443/transformed/fbjni-0.7.0/prefab/modules/fbjni/libs/android.x86_64/libfbjni.so"
    INTERFACE_INCLUDE_DIRECTORIES "E:/gradle-cache/caches/8.13/transforms/d1b1ebd4f68363262eec283220efc443/transformed/fbjni-0.7.0/prefab/modules/fbjni/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

